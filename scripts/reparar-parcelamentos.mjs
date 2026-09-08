/**
 * Converte as parcelas já importadas em parcelamentos de verdade.
 *
 * A importação por conciliação gravou cada parcela como uma despesa solta. A
 * fatura fechou ao centavo, mas a tela de parcelamentos nasceu vazia: sem
 * `installment_plan_id`, o banco não sabe que aquelas doze linhas são a mesma
 * compra, e "parcela 4 de 6" não existe em lugar nenhum.
 *
 * A alternativa óbvia — apagar tudo e reimportar — custaria caro sem
 * necessidade: os lançamentos da conta, os pagamentos de fatura e o rendimento
 * da caixinha estão certos e não têm por que ser refeitos. Este script mexe
 * **só** nas parcelas: reconcilia os mesmos arquivos, encontra na conta as
 * despesas correspondentes, apaga essas e recria como plano.
 *
 * As faturas continuam fechando porque as parcelas voltam com o mesmo valor e
 * a mesma competência — o que muda é apenas o vínculo entre elas.
 *
 * Uso:
 *   node --experimental-strip-types scripts/reparar-parcelamentos.mjs <pasta> --url URL [--aplicar]
 *
 * Sem `--aplicar` ele só mostra o que faria.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { parseOfx } from "../core/domain/import/ofx-parser.ts";
import { assertComplete, reconcile } from "../core/domain/import/reconcile.ts";

const args = process.argv.slice(2);
const pasta = args.find((a) => !a.startsWith("--"));
const aplicar = args.includes("--aplicar");
const indiceUrl = args.indexOf("--url");
const base =
  indiceUrl >= 0 && (args[indiceUrl + 1] ?? "").startsWith("http")
    ? args[indiceUrl + 1]
    : "http://localhost:5173";

if (!pasta) {
  console.error("uso: node --experimental-strip-types scripts/reparar-parcelamentos.mjs <pasta> --url URL [--aplicar]");
  process.exit(1);
}

/**
 * O dia de fechamento do cartão, o mesmo que a importação usou.
 *
 * Não entra na conciliação — ali a competência vem do período declarado no
 * próprio arquivo. Serve para **datar a parcela futura**: o app re-deduz a
 * competência a partir da data da compra, e datar no fechamento é o que
 * coloca cada projeção na sua fatura em vez de empilhar todas na mesma.
 */
const FECHAMENTO = 12;

const brl = (centavos) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dinheiro = (centavos) => (centavos / 100).toFixed(2);

// --- leitura dos arquivos ----------------------------------------------------

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
        ? { kind: "card", cardId: "cartao", competence: parsed.balance.asOf.slice(0, 7) }
        : { kind: "account", accountId: "conta" },
      parsed,
    };
  });

  // Ordem cronológica pela data do saldo, nunca pelo nome do arquivo: em ordem
  // alfabética "01ABR" vem antes de "01JAN", e a abertura sairia de abril.
  return fontes.sort((a, b) =>
    (a.parsed.balance?.asOf ?? "").localeCompare(b.parsed.balance?.asOf ?? ""),
  );
}

function somarMeses(competencia, meses) {
  const [ano, mes] = competencia.split("-").map(Number);
  const total = (ano * 12 + (mes - 1)) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// --- API ---------------------------------------------------------------------

let token = null;
const ARQUIVO_DO_TOKEN = join(homedir(), ".fluxo-importador-token");

async function api(caminho, { method = "GET", body } = {}) {
  const resposta = await fetch(`${base}${caminho}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) {
    throw new Error(`${method} ${caminho} → ${resposta.status}: ${JSON.stringify(corpo?.error ?? corpo)}`);
  }
  return corpo?.data;
}

// --- conciliação -------------------------------------------------------------

const fontes = lerFontes(pasta);
const primeiroExtrato = fontes.filter((f) => !f.ehCartao)[0];
const movimentoInicial = primeiroExtrato.parsed.rows.reduce((s, r) => s + r.amount, 0);
const aberturaConta = primeiroExtrato.parsed.balance.amount - movimentoInicial;

const resultado = reconcile(fontes, {
  accountId: "conta",
  cardId: "cartao",
  investmentAccountId: "caixinha",
  ownExternalAccounts: [],
  openingAccountBalance: aberturaConta,
  openingCardBalance: 0,
});
assertComplete(fontes, resultado);

/**
 * As parcelas, agrupadas por compra.
 *
 * A chave é o identificador do emissor mais o total de parcelas: o mesmo FITID
 * se repete entre parcelas da mesma compra, e é justamente isso que as junta.
 */
const grupos = new Map();
for (const entrada of resultado.entries) {
  if (entrada.kind !== "expense" || !entrada.installment || entrada.origin.kind !== "card") continue;
  if (!entrada.externalId) continue;
  const chave = `${entrada.externalId}|${entrada.installment.total}`;
  if (!grupos.has(chave)) grupos.set(chave, []);
  grupos.get(chave).push(entrada);
}

const estornados = new Set();
for (const par of resultado.cancelled) {
  if (par.debit.externalId) estornados.add(par.debit.externalId);
  if (par.credit.externalId) estornados.add(par.credit.externalId);
}
for (const entrada of resultado.entries) {
  if (entrada.kind === "refund" && entrada.externalId) estornados.add(entrada.externalId);
}

/** As parcelas que ainda vão chegar, projetadas a partir da última cobrada. */
function projetar(lista) {
  const ultima = lista[lista.length - 1];
  const total = ultima.installment.total;
  const futuras = [];
  for (let n = ultima.installment.current + 1; n <= total; n += 1) {
    const competencia = somarMeses(ultima.competence, n - ultima.installment.current);
    futuras.push({
      description: ultima.description,
      amount: ultima.amount,
      occurredOn: `${competencia}-${String(FECHAMENTO).padStart(2, "0")}`,
      competence: competencia,
      installment: { current: n, total },
      planejada: true,
    });
  }
  return futuras;
}

const planos = [];
for (const [chave, lista] of grupos) {
  const id = chave.slice(0, chave.lastIndexOf("|"));
  if (estornados.has(id)) continue;
  lista.sort((a, b) => a.installment.current - b.installment.current);
  const ultima = lista[lista.length - 1];
  const futuras = ultima.installment.current < ultima.installment.total ? projetar(lista) : [];
  planos.push({ cobradas: lista, futuras, todas: [...lista, ...futuras] });
}

console.log(`${planos.length} parcelamentos a recriar`);
console.log(
  `${planos.reduce((s, p) => s + p.cobradas.length, 0)} parcelas cobradas, ` +
    `${planos.reduce((s, p) => s + p.futuras.length, 0)} projetadas`,
);
console.log(`total: ${brl(planos.reduce((s, p) => s + p.todas.reduce((t, e) => t + e.amount, 0), 0))}`);

if (!aplicar) {
  console.log("\nsimulação. Use --aplicar para gravar.");
  process.exit(0);
}

// --- aplicação ---------------------------------------------------------------

if (!existsSync(ARQUIVO_DO_TOKEN)) {
  console.error(`sem token de aparelho em ${ARQUIVO_DO_TOKEN}. Rode a importação primeiro para parear.`);
  process.exit(1);
}
token = readFileSync(ARQUIVO_DO_TOKEN, "utf8").trim();

const cartoes = await api("/api/v1/cards");
const cartao = cartoes.find((c) => c.name === "Nubank UV") ?? cartoes[0];
console.log(`cartão: ${cartao.name}`);

/**
 * Os lançamentos que hoje representam as parcelas.
 *
 * A identidade é (data, valor, descrição): o razão não guarda o FITID, e essa
 * tripla é única o bastante dentro de um cartão — duas compras iguais, no
 * mesmo dia, pelo mesmo valor, seriam de fato indistinguíveis, e nesse caso
 * apagar qualquer uma das duas dá no mesmo.
 */
/*
 * A listagem tem teto de 500 por chamada e não oferece cursor — só recorte por
 * data. Um ano por vez cobre com folga: nem o mês mais movimentado chega perto
 * do teto, e a janela vai de 2025 até as projeções de 2028.
 */
const porChave = new Map();
let lidos = 0;
for (let ano = 2025; ano <= 2028; ano += 1) {
  for (let mes = 1; mes <= 12; mes += 3) {
    const de = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const ate =
      mes === 10 ? `${ano}-12-31` : `${ano}-${String(mes + 2).padStart(2, "0")}-31`;
    const pagina = await api(`/api/v1/transactions?from=${de}&to=${ate}&limit=500`);
    if (pagina.length === 500) {
      console.warn(`  ⚠ ${de}..${ate} veio no teto de 500; pode faltar lançamento`);
    }
    lidos += pagina.length;
    for (const linha of pagina) {
      if (linha.origin?.kind !== "card" || linha.origin.cardId !== cartao.id) continue;
      if (linha.installmentPlanId) continue;
      const chave = `${linha.occurredOn}|${linha.amountCents}|${(linha.description ?? "").trim().toLowerCase()}`;
      if (!porChave.has(chave)) porChave.set(chave, []);
      porChave.get(chave).push(linha);
    }
  }
}
console.log(`${lidos} lançamentos lidos, ${porChave.size} chaves de cartão sem plano`);

let apagados = 0;
let naoEncontrados = 0;

for (const plano of planos) {
  for (const parcela of plano.todas) {
    const chave = `${parcela.occurredOn}|${parcela.amount}|${parcela.description.slice(0, 160).trim().toLowerCase()}`;
    const candidatos = porChave.get(chave);
    if (!candidatos?.length) {
      naoEncontrados += 1;
      continue;
    }
    const alvo = candidatos.shift();
    await api(`/api/v1/transactions/${alvo.id}`, { method: "DELETE" });
    apagados += 1;
  }
}

console.log(`${apagados} lançamentos removidos, ${naoEncontrados} não localizados`);

let criados = 0;
for (const plano of planos) {
  const primeira = plano.todas[0];
  await api("/api/v1/installments/plan", {
    method: "POST",
    body: {
      cardId: cartao.id,
      description: primeira.description.slice(0, 160),
      totalAmount: dinheiro(plano.todas.reduce((soma, p) => soma + p.amount, 0)),
      installmentCount: primeira.installment.total,
      purchaseDate: primeira.occurredOn,
      parcels: plano.todas.map((p) => ({
        number: p.installment.current,
        amountCents: p.amount,
        occurredOn: p.occurredOn,
        competence: p.competence,
        state: p.planejada ? "planned" : "confirmed",
      })),
    },
  });
  criados += 1;
}

console.log(`✅ ${criados} parcelamentos criados`);
