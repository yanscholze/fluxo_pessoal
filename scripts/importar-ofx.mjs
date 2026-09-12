/**
 * Importa extratos e faturas em OFX por conciliação bancária.
 *
 * Diferente de `importar-fluxo-antigo.mjs`, que confiava num export já
 * estruturado, aqui a fonte é o que o banco emite — e o banco não sabe o que é
 * transferência interna, o que é pagamento de fatura nem o que é estorno. Quem
 * decide isso é `core/domain/import/reconcile.ts`, olhando **todos** os
 * arquivos ao mesmo tempo. Este script só orquestra: lê a pasta, chama a
 * conciliação, confere contra o saldo declarado e grava pela API.
 *
 * Uso:
 *   node --experimental-strip-types scripts/importar-ofx.mjs <pasta> [--url URL] [--aplicar]
 *
 * Sem `--aplicar` ele **simula sem autenticar**: lê os arquivos, concilia,
 * confere os saldos e imprime exatamente o que faria. É o modo padrão porque a
 * conferência precisa vir antes da escrita — a importação anterior deste mesmo
 * usuário entrou com valores errados e o estrago só apareceu depois.
 *
 * A gravação exige pareamento: o script pede um código, o dono aprova no site
 * já autenticado, e o script recebe um token de aparelho — revogável com um
 * clique, sem trocar a senha da conta.
 */

import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parseOfx } from "../core/domain/import/ofx-parser.ts";
import { assertComplete, reconcile } from "../core/domain/import/reconcile.ts";

// --- argumentos --------------------------------------------------------------

const args = process.argv.slice(2);
const pasta = args.find((a) => !a.startsWith("--"));
const aplicar = args.includes("--aplicar");
const indiceUrl = args.indexOf("--url");
const base = indiceUrl >= 0 && (args[indiceUrl + 1] ?? "").startsWith("http") ? args[indiceUrl + 1] : "http://localhost:5173";

/**
 * Saldo real da caixinha hoje, em reais (`--caixinha 3223,68`).
 *
 * Os arquivos mostram só o principal — quanto foi aplicado menos quanto foi
 * resgatado. O rendimento o Nubank credita **dentro** da caixinha, e o extrato
 * da conta nunca o enxerga. A caixinha também já tinha saldo antes da janela
 * exportada: o primeiro movimento de janeiro é um resgate, e não se resgata de
 * uma conta vazia.
 *
 * Informado o saldo de hoje, a abertura sai por diferença. Os dois pedaços —
 * o que já havia e o que rendeu — ficam somados num número só, porque os
 * arquivos não dão como separá-los.
 */
const indiceCaixinha = args.indexOf("--caixinha");
const saldoDaCaixinha =
  indiceCaixinha >= 0 && args[indiceCaixinha + 1]
    ? Math.round(Number(args[indiceCaixinha + 1].replace(/\./g, "").replace(",", ".")) * 100)
    : null;

if (!pasta) {
  console.error(
    "uso: node --experimental-strip-types scripts/importar-ofx.mjs <pasta> [--url URL] [--caixinha VALOR] [--aplicar]",
  );
  process.exit(64);
}

const brl = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** Centavos viram a string que a API espera, sem passar por float. */
const dinheiro = (c) => (c / 100).toFixed(2).replace(".", ",");

// --- o que este banco é ------------------------------------------------------

/**
 * Dia de fechamento e de vencimento da fatura.
 *
 * O vencimento é dia 20, como o nome dos arquivos indica. O fechamento merece
 * explicação, porque **não** é o 13 que aparece no arquivo.
 *
 * O Nubank exporta a fatura como `[DTSTART, DTEND)`: o arquivo que vai de
 * 13/08 a 13/09 contém a compra do dia 13/08 e não contém a do dia 13/09. Já a
 * janela do Fluxo é `(fechamento anterior, fechamento]` — fim inclusivo. As
 * duas descrevem o mesmo intervalo quando o fechamento do Fluxo é 12.
 *
 * Com 13, 91 das 238 linhas do cartão cairiam na fatura errada. Com 12, zero.
 *
 * `closingAdjustment: "none"` é a outra metade: o Nubank fecha dia 13 mesmo em
 * sábado e domingo (13/06 e 13/09 de 2026 são fim de semana), enquanto o Fluxo
 * recua o fechamento para o dia útil anterior por padrão. Sem desligar isso,
 * duas compras de 11/07 migravam para a fatura de agosto.
 */
const FECHAMENTO = 12;
const VENCIMENTO = 20;
const AJUSTE_DE_FECHAMENTO = "none";

const CONTA = { nome: "Nubank Conta Corrente", kind: "checking", instituicao: "Nu Pagamentos" };
const CAIXINHA = { nome: "Nubank Caixinha", kind: "investment", instituicao: "Nu Pagamentos" };
const EXTERNA = { nome: "Mercado Pago e XP", kind: "checking", instituicao: "Mercado Pago / XP" };
const CARTAO = { nome: "Nubank Cartão", kind: "credit" };

/**
 * Contas do próprio usuário em outros bancos.
 *
 * O Pix entre contas de mesma titularidade não é renda nem gasto — é o mesmo
 * dinheiro trocando de lugar. Sem esta regra, os R$ 1.046,07 que vieram do
 * Mercado Pago entrariam como receita e inflariam a renda do período.
 */
const CONTAS_PROPRIAS = [{ match: "Yan Augusto Scholze", conta: "externa" }];

/**
 * Categorização por trecho da descrição.
 *
 * A ordem importa: a primeira regra que casar vence, e as mais específicas vêm
 * primeiro. `null` significa "não categorizar" — usado para o que é movimento
 * interno e não consumo.
 */
const CATEGORIAS = {
  receita: [
    ["Adriane Maria Grossl Scholze", "Ajuda familiar"],
    ["Reis Car Oficina Mecanica", "Trabalho"],
    ["Company Sistemas", "Trabalho"],
  ],
  despesa: [
    ["Star Protecao Veicular", "Veículo"],
    ["Sefaz Santa Catarina", "Impostos"],
    ["Central da Injecao", "Veículo"],
    ["Gemor Auto Pecas", "Veículo"],
    ["Disk Pecas", "Veículo"],
    ["Giba Auto Pecas", "Veículo"],
    ["Cj Distribuidora", "Veículo"],
    ["Custon Garage", "Veículo"],
    ["Toyoauto", "Veículo"],
    ["Trustmoto", "Veículo"],
    ["Rsperformance", "Veículo"],
    ["Raceking", "Veículo"],
    ["Mercadolivre*Parts", "Veículo"],
    ["Bilhart", "Veículo"],
    ["Shell Box", "Combustível"],
    ["Posto", "Combustível"],
    ["Boco Gas", "Combustível"],
    ["NuTag", "Pedágio"],
    ["Komprao Koch", "Mercado"],
    ["Fort Atacadista", "Mercado"],
    ["Condor Super Center", "Mercado"],
    ["Mercado Zimerman", "Mercado"],
    ["Churros", "Alimentação"],
    ["Milky Moo", "Alimentação"],
    ["Cafe Cultura", "Alimentação"],
    ["Burger King", "Alimentação"],
    ["The Best Acai", "Alimentação"],
    ["Azzuli", "Alimentação"],
    ["Arte Caseira", "Alimentação"],
    ["Chelas Cocina", "Alimentação"],
    ["Emporio Sabor", "Alimentação"],
    ["Panificadora", "Alimentação"],
    ["Cine ", "Lazer"],
    ["Ticketmais", "Lazer"],
    ["Oneticket", "Lazer"],
    ["Strike Park", "Lazer"],
    ["Mansao188", "Lazer"],
    ["Pousadasitionovo", "Viagem"],
    ["Nubank Ultravioleta", "Assinaturas"],
    ["Anthropic", "Assinaturas"],
    ["Steam", "Lazer"],
    ["Pichau", "Tecnologia"],
    ["Samsung", "Tecnologia"],
    ["Paypal", "Tecnologia"],
    ["Wos Comercio de Suplem", "Saúde"],
    ["Duxnutrition", "Saúde"],
    ["Decathlon", "Saúde"],
    ["Estofar Haus", "Casa"],
    ["Moveismarala", "Casa"],
    ["Marlisa Armarinho", "Casa"],
    ["Mercadolivre", "Compras online"],
    ["Mercado*", "Compras online"],
    ["Shopee", "Compras online"],
    ["Shein", "Compras online"],
    ["Aliexpress", "Compras online"],
    ["Tiktok", "Compras online"],
    ["Compra no débito", "Outros gastos"],
    ["IOF", "Tarifas"],
  ],
};

const CATEGORIA_PADRAO = { expense: "Outros gastos", income: "Outras receitas" };

function achatar(texto) {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function categoriaDe(kind, descricao) {
  if (kind !== "expense" && kind !== "income") return null;
  const texto = achatar(descricao);
  const regras = kind === "expense" ? CATEGORIAS.despesa : CATEGORIAS.receita;
  const achou = regras.find(([trecho]) => texto.includes(achatar(trecho)));
  return achou ? achou[1] : CATEGORIA_PADRAO[kind];
}

// --- leitura dos arquivos ----------------------------------------------------

/**
 * Lê a pasta e monta as fontes da conciliação.
 *
 * A codificação vem do cabeçalho do próprio arquivo: o Nubank exporta o extrato
 * em UTF-8 e a fatura em CP-1252. Ler os dois como um só destrói os acentos —
 * e descrição com acento quebrado não casa com regra de categoria nenhuma.
 */
function lerFontes(diretorio) {
  const nomes = readdirSync(diretorio).filter((n) => n.toLowerCase().endsWith(".ofx"));
  if (nomes.length === 0) throw new Error(`nenhum .ofx em ${diretorio}`);

  const fontes = nomes.map((nome) => {
    const bruto = readFileSync(join(diretorio, nome));
    const cabecalho = bruto.subarray(0, 200).toString("latin1");
    const texto = bruto.toString(/ENCODING:UTF-8/i.test(cabecalho) ? "utf8" : "latin1");
    const ehCartao = texto.includes("<CREDITCARDMSGSRSV1>");
    const parsed = parseOfx(texto);

    return {
      label: nome,
      ehCartao,
      target: ehCartao
        ? { kind: "card", cardId: "cartao", competence: competenciaDaFatura(parsed) }
        : { kind: "account", accountId: "conta" },
      parsed,
    };
  });

  // Ordem cronológica pela data do saldo, nunca pelo nome do arquivo. O Nubank
  // nomeia o extrato com o mês abreviado em português, e em ordem alfabética
  // "01ABR" vem antes de "01JAN" — o que faria a abertura ser deduzida do
  // extrato de abril e jogar todo o histórico da conta fora por um valor fixo.
  return fontes.sort((a, b) => {
    const esquerda = a.parsed.balance?.asOf ?? "";
    const direita = b.parsed.balance?.asOf ?? "";
    return esquerda.localeCompare(direita);
  });
}

/**
 * Competência da fatura, deduzida do fechamento.
 *
 * A fatura que fecha em 13/01 vence em 20/01 e é a competência 2026-01. Usar a
 * data das compras daria a competência errada: compra de 25/12 pertence à
 * fatura de janeiro, não à de dezembro.
 */
function competenciaDaFatura(parsed) {
  const fim = parsed.balance?.asOf;
  if (!fim) throw new Error("fatura sem LEDGERBAL: não dá para saber a competência");
  return fim.slice(0, 7);
}

// --- catálogo ----------------------------------------------------------------

let cookie = "";
let token = null;
const ARQUIVO_DO_TOKEN = join(homedir(), ".fluxo-importador-token");

async function api(caminho, { method = "GET", body } = {}) {
  const resposta = await fetch(`${base}${caminho}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const definido = resposta.headers.get("set-cookie");
  if (definido) cookie = definido.split(";")[0];

  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) {
    throw new Error(`${method} ${caminho} → ${resposta.status}: ${JSON.stringify(corpo?.error ?? corpo)}`);
  }
  return corpo?.data;
}

/**
 * Entra na conta.
 *
 * Senha vem do ambiente, nunca de argumento: linha de comando vaza no histórico
 * do shell e na lista de processos. É o caminho para rodar contra o servidor
 * local. Contra produção, o normal é o pareamento — ninguém digita senha aqui.
 */
async function autenticar() {
  const email = process.env.FLUXO_EMAIL;
  const senha = process.env.FLUXO_SENHA;
  if (email && senha) {
    await api("/api/v1/session", { method: "POST", body: { action: "signin", email, password: senha } });
    console.log("autenticado por senha do ambiente.");
    return;
  }

  if (existsSync(ARQUIVO_DO_TOKEN)) {
    token = readFileSync(ARQUIVO_DO_TOKEN, "utf8").trim();
    try {
      const sessao = await api("/api/v1/session");
      if (sessao?.authenticated) {
        console.log(`autenticado como ${sessao.user.email} (token guardado).`);
        return;
      }
    } catch {
      /* token vencido: segue para o pareamento */
    }
    token = null;
    unlinkSync(ARQUIVO_DO_TOKEN);
  }

  const deviceId = `importador-ofx-${Date.now()}`;
  const pedido = await api("/api/v1/pairing", {
    method: "POST",
    body: { deviceId, deviceName: "Importador de OFX", platform: "script" },
  });

  console.log("\n  ┌──────────────────────────────────────────────┐");
  console.log(`  │   código de pareamento:  ${String(pedido.code).padEnd(20)}│`);
  console.log("  └──────────────────────────────────────────────┘");
  console.log(`\n  Abra ${base}/conectar já autenticado e digite o código.\n  Aguardando aprovação…\n`);

  const limite = Date.now() + 10 * 60_000;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 2500));
    const resultado = await api("/api/v1/pairing", {
      method: "PUT",
      body: { code: pedido.code, pollToken: pedido.pollToken },
    });
    if (resultado?.status === "approved" && resultado.token) {
      token = resultado.token;
      writeFileSync(ARQUIVO_DO_TOKEN, token, { mode: 0o600 });
      console.log("pareamento aprovado.\n");
      return;
    }
  }
  throw new Error("pareamento não aprovado em 10 minutos");
}

/** Cria o que faltar e devolve o id de cada peça, por nome. */
/**
 * Abertura da conta que representa Mercado Pago e XP.
 *
 * Esses arquivos não existem: o usuário só exportou o Nubank. O que se sabe é
 * quanto saiu de lá para cá, e esse dinheiro existia antes da janela importada.
 * Abrir a conta com exatamente o valor que ela transferiu a deixa encerrando em
 * zero, que é a leitura mais provável — ele foi esvaziando essas contas para o
 * Nubank. Se o saldo real for outro, é um número só para corrigir no app, e
 * nenhum outro saldo depende dele.
 */
/**
 * Principal da caixinha: aplicado menos resgatado, dentro da janela importada.
 */
function principalDaCaixinha(resultado, idCaixinha) {
  return resultado.entries.reduce((total, entrada) => {
    if (entrada.kind !== "transfer") return total;
    const entrou = entrada.destination?.kind === "account" && entrada.destination.id === idCaixinha;
    const saiu = entrada.origin.kind === "account" && entrada.origin.id === idCaixinha;
    return total + (entrou ? entrada.amount : 0) - (saiu ? entrada.amount : 0);
  }, 0);
}

function aberturaDasContasProprias(resultado, idExterna) {
  return resultado.entries.reduce((total, entrada) => {
    if (entrada.kind !== "transfer") return total;
    const saiu = entrada.origin.kind === "account" && entrada.origin.id === idExterna;
    const entrou = entrada.destination?.kind === "account" && entrada.destination.id === idExterna;
    return total + (saiu ? entrada.amount : 0) - (entrou ? entrada.amount : 0);
  }, 0);
}

async function garantirCatalogo(saldoAbertura, aberturaExterna) {
  // As rotas de listagem devolvem o array direto em `data`, e `api()` já
  // desembrulha isso — não existe `.accounts` nem `.cards` para acessar.
  const contas = new Map((await api("/api/v1/accounts")).map((c) => [c.name, c.id]));
  const cartoes = new Map((await api("/api/v1/cards")).map((c) => [c.name, c.id]));
  const categorias = new Map((await api("/api/v1/categories")).map((c) => [`${c.kind}:${c.name}`, c.id]));

  const idDe = {};
  /**
   * Quanto cada conta já tinha antes da janela importada.
   *
   * Guardado aqui e lançado em `gravar()` como entrada visível, nunca como
   * `openingBalance`: abertura é uma constante somada a **toda** data da série
   * e faria o patrimônio mostrar dinheiro em meses que o app não acompanhou.
   */
  const aberturas = {};
  for (const [chave, spec, abertura] of [
    ["conta", CONTA, saldoAbertura],
    ["caixinha", CAIXINHA, 0],
    ["externa", EXTERNA, aberturaExterna],
  ]) {
    if (abertura) aberturas[chave] = abertura;
    if (contas.has(spec.nome)) {
      idDe[chave] = contas.get(spec.nome);
      continue;
    }
    // Nome ocupado por conta **arquivada** não aparece na listagem, mas o
    // cadastro recusa mesmo assim. Sem esta saída, uma importação anterior já
    // desfeita bloqueia a próxima por causa de um nome que ninguém mais vê.
    let nome = spec.nome;
    let criada = null;
    for (let tentativa = 1; tentativa <= 20 && criada === null; tentativa += 1) {
      try {
        criada = await api("/api/v1/accounts", {
          method: "POST",
          body: {
            name: nome,
            kind: spec.kind,
            institution: spec.instituicao,
            includeInTotals: true,
            // Nunca saldo de abertura: ele é uma constante somada a toda data
            // da série e faz o patrimônio mostrar dinheiro em meses que o app
            // não acompanhou. A diferença entra como lançamento visível, no
            // primeiro dia da janela — ver `gravar()`.
          },
        });
      } catch (erro) {
        if (!/409|duplicate/i.test(String(erro.message))) throw erro;
        nome = `${spec.nome} (${tentativa + 1})`;
        console.log(`  nome ocupado por registro arquivado; usando "${nome}"`);
      }
    }
    if (criada === null) throw new Error(`não consegui um nome livre para "${spec.nome}"`);
    idDe[chave] = criada.id;
    contas.set(nome, criada.id);
  }

  if (cartoes.has(CARTAO.nome)) {
    idDe.cartao = cartoes.get(CARTAO.nome);
  } else {
    // Mesma armadilha das contas: cartão arquivado não aparece na listagem e
    // continua segurando o nome.
    let nome = CARTAO.nome;
    let criado = null;
    for (let tentativa = 1; tentativa <= 20 && criado === null; tentativa += 1) {
      try {
        criado = await api("/api/v1/cards", {
          method: "POST",
          body: {
            name: nome,
            kind: "credit",
            paymentAccountId: idDe.conta,
            closingDay: FECHAMENTO,
            dueDay: VENCIMENTO,
            closingAdjustment: AJUSTE_DE_FECHAMENTO,
            isPrimary: true,
          },
        });
      } catch (erro) {
        if (!/409|duplicate/i.test(String(erro.message))) throw erro;
        nome = `${CARTAO.nome} (${tentativa + 1})`;
        console.log(`  nome de cartão ocupado por registro arquivado; usando "${nome}"`);
      }
    }
    if (criado === null) throw new Error(`não consegui um nome livre para o cartão "${CARTAO.nome}"`);
    idDe.cartao = criado.id;
  }

  idDe.categorias = async (kind, nome) => {
    const chave = `${kind}:${nome}`;
    if (categorias.has(chave)) return categorias.get(chave);

    // Categoria arquivada não vem na listagem, mas continua ocupando o nome no
    // índice único. Uma importação anterior desfeita deixa esses nomes presos,
    // e sem esta saída a importação inteira morre na primeira colisão.
    let usado = nome;
    for (let tentativa = 1; tentativa <= 20; tentativa += 1) {
      try {
        const criada = await api("/api/v1/categories", { method: "POST", body: { name: usado, kind } });
        categorias.set(chave, criada.id);
        if (usado !== nome) console.log(`  categoria "${nome}" estava arquivada; criada como "${usado}"`);
        return criada.id;
      } catch (erro) {
        if (!/409|duplicate/i.test(String(erro.message))) throw erro;
        usado = `${nome} ${tentativa + 1}`;
      }
    }
    throw new Error(`não consegui um nome livre para a categoria "${nome}"`);
  };

  return { idDe, aberturas };
}

// --- parcelas futuras --------------------------------------------------------

function somarMeses(competencia, meses) {
  const [ano, mes] = competencia.split("-").map(Number);
  const total = (ano * 12 + (mes - 1)) + meses;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * Projeta as parcelas que ainda não venceram.
 *
 * Elas não estão em arquivo nenhum — a fatura só mostra o que já foi cobrado —,
 * mas são dívida assumida. Sem projetá-las, o comprometimento futuro do usuário
 * aparece zerado justamente nos meses em que ele é maior.
 *
 * Compra estornada não é projetada: o grupo que teve crédito de devolução
 * deixou de existir, e continuar cobrando as parcelas seguintes inventaria uma
 * dívida que o usuário não tem.
 */
function projetarParcelas(resultado) {
  const estornados = new Set();
  for (const par of resultado.cancelled) {
    if (par.debit.externalId) estornados.add(par.debit.externalId);
    if (par.credit.externalId) estornados.add(par.credit.externalId);
  }
  for (const entrada of resultado.entries) {
    if (entrada.kind === "refund" && entrada.externalId) estornados.add(entrada.externalId);
  }

  const grupos = new Map();
  for (const entrada of resultado.entries) {
    if (entrada.kind !== "expense" || !entrada.installment || entrada.origin.kind !== "card") continue;
    if (!entrada.externalId) continue;
    const chave = `${entrada.externalId}|${entrada.installment.total}`;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(entrada);
  }

  const futuras = [];
  for (const [chave, lista] of grupos) {
    const id = chave.slice(0, chave.lastIndexOf("|"));
    if (estornados.has(id)) continue;

    lista.sort((a, b) => a.installment.current - b.installment.current);
    const ultima = lista[lista.length - 1];
    const total = ultima.installment.total;
    if (ultima.installment.current >= total) continue;

    // O valor da parcela futura é o da última cobrada: é o que o emissor vem
    // praticando, e o centavo de arredondamento ele acerta na última.
    for (let n = ultima.installment.current + 1; n <= total; n += 1) {
      const competencia = somarMeses(ultima.competence, n - ultima.installment.current);
      futuras.push({
        kind: "expense",
        description: ultima.description,
        amount: ultima.amount,
        // A data é o próprio dia do fechamento da competência de destino.
        //
        // O app NÃO guarda a competência que mandamos: ele a re-deduz da data
        // da compra e do ciclo do cartão. Mandar a data da última parcela já
        // cobrada, que era o instinto, jogaria as 67 parcelas futuras todas na
        // mesma fatura. Datar no fechamento coloca cada uma na sua.
        occurredOn: `${competencia}-${String(FECHAMENTO).padStart(2, "0")}`,
        origin: ultima.origin,
        competence: competencia,
        installment: { current: n, total },
        planejada: true,
        source: "projeção",
      });
    }
  }
  return futuras;
}

// --- relatório ---------------------------------------------------------------

function relatar(resultado, futuras) {
  const porTipo = new Map();
  for (const e of resultado.entries) {
    const atual = porTipo.get(e.kind) ?? { n: 0, total: 0 };
    porTipo.set(e.kind, { n: atual.n + 1, total: atual.total + e.amount });
  }

  console.log("\n=== O QUE SERIA CRIADO ===");
  for (const [kind, v] of [...porTipo].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${kind.padEnd(17)} ${String(v.n).padStart(4)} × ${brl(v.total).padStart(15)}`);
  }
  if (futuras.length) {
    const soma = futuras.reduce((s, f) => s + f.amount, 0);
    console.log(`  ${"parcela futura".padEnd(17)} ${String(futuras.length).padStart(4)} × ${brl(soma).padStart(15)}  (planejadas)`);
  }

  console.log(`\n  pares anulados: ${resultado.cancelled.length}   pendências: ${resultado.unmatched.length}`);

  const aberturaExterna = aberturaDasContasProprias(resultado, "externa");
  if (aberturaExterna !== 0) {
    console.log(
      `\n  SUPOSIÇÃO: "${EXTERNA.nome}" abre com ${brl(aberturaExterna)} para encerrar em zero.` +
        `\n  Esses arquivos não foram exportados; se o saldo real for outro, é só corrigir no app.`,
    );
  }

  if (resultado.unmatched.length) {
    console.log("\n=== PENDÊNCIAS (precisam de olho humano) ===");
    for (const u of resultado.unmatched) {
      console.log(`  ${u.row.date}  ${brl(u.row.amount).padStart(13)}  ${u.row.description.slice(0, 50)}`);
      console.log(`       esperava ${u.expected}  (${u.source})`);
    }
  }

  console.log("\n=== CONFERÊNCIA CONTRA O SALDO DO BANCO ===");
  let todosOk = true;
  for (const b of resultado.balances) {
    if (!b.matches) todosOk = false;
    console.log(
      `  ${b.matches ? "✅" : "❌"} ${b.source.padEnd(38)} banco ${brl(b.declared).padStart(13)}   conciliado ${brl(b.reconciled).padStart(13)}`,
    );
  }
  return todosOk;
}

// --- gravação ----------------------------------------------------------------

/**
 * Distribui os pagamentos entre as faturas que eles de fato quitaram.
 *
 * O período do extrato **não** é a fatura. O Nubank fecha dia 13 e o pagamento
 * que aparece no extrato de fevereiro pode estar quitando a fatura de janeiro,
 * ou adiantando a de fevereiro, ou as duas coisas — foi o que aconteceu em
 * três dos nove meses aqui.
 *
 * Por isso a alocação é cronológica e por saldo: cada pagamento abate a fatura
 * aberta mais antiga, e o que sobrar transborda para a seguinte. Um pagamento
 * que quita uma fatura e adianta a próxima vira dois lançamentos na mesma data,
 * que é exatamente o que ele foi.
 *
 * Sem isto, `payInvoice` recusa — ela não deixa pagar mais do que a fatura deve,
 * e é ela que está certa: aceitar o excesso criaria fatura com saldo negativo.
 */
function alocarPagamentos(resultado) {
  const devido = new Map();
  for (const e of resultado.entries) {
    if (e.origin.kind !== "card" || !e.competence) continue;
    const atual = devido.get(e.competence) ?? 0;
    if (e.kind === "expense") devido.set(e.competence, atual + e.amount);
    if (e.kind === "refund") devido.set(e.competence, atual - e.amount);
  }

  const competencias = [...devido.keys()].sort();
  const pagamentos = resultado.entries
    .filter((e) => e.kind === "invoice_payment")
    .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));

  const alocados = [];
  const sobras = [];
  for (const pagamento of pagamentos) {
    let resto = pagamento.amount;
    for (const c of competencias) {
      if (resto <= 0) break;
      const aberto = devido.get(c) ?? 0;
      if (aberto <= 0) continue;
      const aplicado = Math.min(resto, aberto);
      devido.set(c, aberto - aplicado);
      resto -= aplicado;
      alocados.push({ ...pagamento, competence: c, amount: aplicado });
    }
    if (resto > 0) sobras.push({ ...pagamento, amount: resto });
  }
  return { alocados, sobras };
}

async function gravar(resultado, futuras, idDe, lucroDaCaixinha, inicioDaJanela, aberturas) {
  let criados = 0;
  const { alocados, sobras } = alocarPagamentos(resultado);
  if (sobras.length) {
    throw new Error(
      `${sobras.length} pagamento(s) sem fatura aberta para abater — ` +
        `total ${brl(sobras.reduce((s, p) => s + p.amount, 0))}. Isso não deveria acontecer; investigue antes de gravar.`,
    );
  }

  // As compras precisam existir antes do pagamento: `payInvoice` recusa quitar
  // uma fatura que ainda não tem nada dentro. Por isso os pagamentos vão por
  // último, e entre si em ordem de data — cada um confere o saldo da conta na
  // data em que aconteceu, e esse saldo depende dos anteriores.
  /*
   * As parcelas viram plano; o resto vira lançamento solto.
   *
   * A primeira versão gravava cada parcela como uma despesa independente. A
   * fatura fechava certo, mas a tela de parcelamentos nascia vazia e não havia
   * como saber quanto faltava de nada — a informação de "parcela 4 de 6"
   * simplesmente não existia no banco.
   *
   * O plano é montado com as parcelas de verdade: as que a fatura cobrou, com
   * o valor e a competência que o emissor usou, mais as projetadas à frente.
   * O total é a soma delas, não o valor original da compra, porque parcela
   * anterior ao período exportado nunca chegou aqui.
   */
  const planos = new Map();
  const soltos = [];

  for (const entrada of [...resultado.entries.filter((e) => e.kind !== "invoice_payment"), ...futuras]) {
    if (entrada.kind === "expense" && entrada.origin.kind === "card" && entrada.installment && entrada.externalId) {
      const chave = `${entrada.externalId}|${entrada.installment.total}`;
      if (!planos.has(chave)) planos.set(chave, []);
      planos.get(chave).push(entrada);
    } else {
      soltos.push(entrada);
    }
  }

  const primeiro = soltos.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));

  // O lucro entra primeiro, na data de abertura da janela.
  //
  // Ele é o que a caixinha rendeu — e o que ela já tinha — antes de o Fluxo
  // começar a acompanhar. Poderia virar saldo de abertura da conta, mas aí
  // sumiria do extrato: o usuário veria o patrimônio certo sem nenhuma linha
  // explicando de onde ele veio. Como lançamento, ele aparece.
  //
  // A data é o início do período, e não o fim, porque a caixinha já tinha
  // saldo quando a janela começa: o primeiro movimento de janeiro é um
  // resgate, e lançar o lucro no fim deixaria o histórico negativo até lá.
  /*
   * O que cada conta já tinha antes da janela entra como lançamento.
   *
   * Nunca como `openingBalance`: abertura é uma constante somada a **toda**
   * data da série histórica, e faria o patrimônio mostrar esse dinheiro em
   * meses que o app não acompanhou — foi exatamente o que aconteceu, e o
   * usuário viu patrimônio em outubro de 2025 sobre dados que começam em
   * janeiro de 2026.
   */
  for (const [chave, valor] of Object.entries(aberturas ?? {})) {
    if (!valor) continue;
    await api("/api/v1/transactions", {
      method: "POST",
      body: {
        kind: valor > 0 ? "income" : "expense",
        description: "Saldo anterior ao Fluxo",
        amount: dinheiro(Math.abs(valor)),
        occurredOn: inicioDaJanela,
        state: "confirmed",
        accountId: idDe[chave],
      },
    });
    criados += 1;
  }

  if (lucroDaCaixinha > 0) {
    await api("/api/v1/transactions", {
      method: "POST",
      body: {
        kind: "income",
        description: "Rendimento da caixinha anterior ao Fluxo",
        amount: dinheiro(lucroDaCaixinha),
        occurredOn: inicioDaJanela,
        state: "confirmed",
        accountId: idDe.caixinha,
        categoryId: await idDe.categorias("income", "Rendimentos"),
      },
    });
    criados += 1;
  }

  for (const entrada of primeiro) {
    const nomeCategoria = categoriaDe(entrada.kind, entrada.description);
    const categoryId = nomeCategoria
      ? await idDe.categorias(entrada.kind === "income" ? "income" : "expense", nomeCategoria)
      : null;

    const origem = entrada.origin.kind === "card" ? { cardId: idDe.cartao } : { accountId: idDe[entrada.origin.id] ?? entrada.origin.id };
    const destino = entrada.destination ? { destinationAccountId: idDe[entrada.destination.id] ?? entrada.destination.id } : {};

    await api("/api/v1/transactions", {
      method: "POST",
      body: {
        kind: entrada.kind,
        description: entrada.description.slice(0, 160),
        amount: dinheiro(entrada.amount),
        occurredOn: entrada.occurredOn,
        state: entrada.planejada ? "planned" : "confirmed",
        ...(categoryId ? { categoryId } : {}),
        ...origem,
        ...destino,
      },
    });
    criados += 1;
  }

  for (const [, parcelas] of planos) {
    parcelas.sort((a, b) => a.installment.current - b.installment.current);
    const primeira = parcelas[0];
    const nomeCategoria = categoriaDe("expense", primeira.description);
    const categoryId = nomeCategoria ? await idDe.categorias("expense", nomeCategoria) : null;

    await api("/api/v1/installments/plan", {
      method: "POST",
      body: {
        cardId: idDe.cartao,
        description: primeira.description.slice(0, 160),
        ...(categoryId ? { categoryId } : {}),
        totalAmount: dinheiro(parcelas.reduce((soma, p) => soma + p.amount, 0)),
        installmentCount: primeira.installment.total,
        purchaseDate: primeira.occurredOn,
        parcels: parcelas.map((p) => ({
          number: p.installment.current,
          amountCents: p.amount,
          occurredOn: p.occurredOn,
          competence: p.competence,
          state: p.planejada ? "planned" : "confirmed",
        })),
      },
    });
    criados += parcelas.length;
  }

  for (const pagamento of alocados) {
    await api("/api/v1/invoices/pay", {
      method: "POST",
      body: {
        cardId: idDe.cartao,
        competence: pagamento.competence,
        accountId: idDe.conta,
        amount: dinheiro(pagamento.amount),
        paidOn: pagamento.occurredOn,
      },
    });
    criados += 1;
  }

  return criados;
}

// --- execução ----------------------------------------------------------------

const fontes = lerFontes(pasta);
console.log(`${fontes.length} arquivos: ${fontes.filter((f) => !f.ehCartao).length} de conta, ${fontes.filter((f) => f.ehCartao).length} de fatura`);

/**
 * Saldo de abertura da conta.
 *
 * O `LEDGERBAL` do primeiro extrato já embute tudo que veio antes do período
 * exportado; a abertura é ele menos o movimento do próprio arquivo. Deduzir
 * assim, em vez de pedir ao usuário, evita o erro que estragou a importação
 * anterior — um saldo digitado que não conversava com os lançamentos.
 */
const primeiroExtrato = fontes.filter((f) => !f.ehCartao)[0];
const movimentoInicial = primeiroExtrato.parsed.rows.reduce((s, r) => s + r.amount, 0);
const aberturaConta = primeiroExtrato.parsed.balance.amount - movimentoInicial;
console.log(`saldo de abertura da conta em ${primeiroExtrato.parsed.balance.asOf}: ${brl(aberturaConta)}`);

const config = {
  accountId: "conta",
  cardId: "cartao",
  investmentAccountId: "caixinha",
  ownExternalAccounts: CONTAS_PROPRIAS.map((r) => ({ match: r.match, accountId: r.conta })),
  openingAccountBalance: aberturaConta,
  openingCardBalance: 0,
};

const resultado = reconcile(fontes, config);
assertComplete(fontes, resultado);
console.log("✅ nenhuma linha se perdeu na conciliação");

/** Primeiro dia coberto pelos arquivos: onde o lucro anterior é ancorado. */
const inicioDaJanela = resultado.entries
  .map((e) => e.occurredOn)
  .sort()[0];

const principalCaixinha = principalDaCaixinha(resultado, "caixinha");
const aberturaCaixinha = saldoDaCaixinha === null ? 0 : saldoDaCaixinha - principalCaixinha;

const futuras = projetarParcelas(resultado);
const saldosOk = relatar(resultado, futuras);

console.log("\n=== CAIXINHA ===");
console.log(`  principal na janela (aplicado − resgatado): ${brl(principalCaixinha)}`);
if (saldoDaCaixinha === null) {
  console.log(`  saldo real não informado: a caixinha vai encerrar em ${brl(principalCaixinha)},`);
  console.log("  abaixo do real. Use --caixinha VALOR para fechar o saldo exato.");
} else {
  console.log(`  saldo real informado:                      ${brl(saldoDaCaixinha)}`);
  console.log(`  lucro a lançar:                            ${brl(aberturaCaixinha)}`);
  if (aberturaCaixinha < 0) {
    console.error("\n❌ o saldo informado é menor que o principal aplicado. Confira o valor.");
    process.exit(1);
  }
}

if (!aplicar) {
  console.log("\nsimulação — nada foi gravado. Use --aplicar para importar de verdade.");
  process.exit(saldosOk ? 0 : 1);
}

if (!saldosOk) {
  console.error("\n❌ os saldos não fecham. Importar assim colocaria número errado no app; corrija antes.");
  process.exit(1);
}
if (resultado.unmatched.length) {
  console.error("\n❌ há pendências sem par. Resolva antes de gravar.");
  process.exit(1);
}

await autenticar();

/**
 * Importar duas vezes duplicaria tudo.
 *
 * O script não grava o fingerprint de cada linha, então não tem como saber, na
 * segunda execução, o que já entrou — e uma importação duplicada é pior que
 * nenhuma: o saldo dobra e não há de onde deduzir o que apagar. A guarda é
 * grosseira de propósito: exige conta vazia, que é a única situação em que a
 * gravação é comprovadamente segura.
 */
const jaExiste = await api("/api/v1/transactions?limit=1");
if ((jaExiste ?? []).length > 0) {
  console.error(
    "\n❌ já existem lançamentos nesta conta. Este importador só grava em conta vazia,\n" +
      "   porque não sabe distinguir o que já entrou e duplicaria o histórico.\n" +
      "   Esvazie pelo app (ou use scripts/limpar-conta.mjs) e rode de novo.",
  );
  process.exit(1);
}

const aberturaExterna = aberturaDasContasProprias(resultado, "externa");
const { idDe, aberturas } = await garantirCatalogo(aberturaConta, aberturaExterna);
const criados = await gravar(resultado, futuras, idDe, aberturaCaixinha, inicioDaJanela, aberturas);
console.log(`\n✅ ${criados} lançamentos criados.`);
