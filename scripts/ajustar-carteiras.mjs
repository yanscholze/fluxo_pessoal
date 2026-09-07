/**
 * Ajustes de carteira depois da importação por conciliação.
 *
 * A importação reconstrói o que os arquivos provam. Estes ajustes são o que só
 * o dono sabe: que a caixinha é o dinheiro do dia a dia e não um investimento
 * parado, quanto tem de vale, e quais parcelas são empréstimo do cartão em vez
 * de consumo do mês.
 *
 * Uso:
 *   node scripts/ajustar-carteiras.mjs [--url URL] [--vale VALOR] [--aplicar]
 *
 * Simula por padrão. Autentica pelo token guardado do importador.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const iUrl = args.indexOf("--url");
const base = iUrl >= 0 && (args[iUrl + 1] ?? "").startsWith("http") ? args[iUrl + 1] : "http://localhost:5173";
const iVale = args.indexOf("--vale");
const valeCentavos =
  iVale >= 0 && args[iVale + 1]
    ? Math.round(Number(args[iVale + 1].replace(/\./g, "").replace(",", ".")) * 100)
    : null;

const brl = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dinheiro = (c) => (c / 100).toFixed(2).replace(".", ",");

/**
 * Compras que são empréstimo tomado no cartão, não consumo do mês.
 *
 * Parcelamento longo de valor alto funciona como crédito: o dinheiro já foi
 * gasto lá atrás e o que resta é a dívida sendo amortizada. Contá-lo como
 * compromisso do mês faz a folga despencar todo mês pelo mesmo motivo, e o
 * usuário perde a única pergunta que o app existe para responder.
 */
const EMPRESTIMOS = ["Gemor Auto Pecas", "Disk Pecas", "Asaasip*Bilhart", "Pousadasitionovo"];
const CATEGORIA_EMPRESTIMO = "Empréstimo do Cartão";
const CONTA_VALE = { nome: "Caju V.A", kind: "benefit", instituicao: "Caju" };
const CAIXINHA = "Nubank Caixinha";

let token = null;
const ARQUIVO_DO_TOKEN = join(homedir(), ".fluxo-importador-token");

async function api(caminho, { method = "GET", body } = {}) {
  const resposta = await fetch(`${base}${caminho}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const texto = await resposta.text();
  const corpo = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) throw new Error(`${method} ${caminho} → ${resposta.status}: ${JSON.stringify(corpo?.error ?? corpo)}`);
  return corpo?.data;
}

if (!existsSync(ARQUIVO_DO_TOKEN)) {
  console.error("sem token guardado. Rode o importador antes, que ele faz o pareamento.");
  process.exit(1);
}
token = readFileSync(ARQUIVO_DO_TOKEN, "utf8").trim();

const sessao = await api("/api/v1/session");
if (!sessao?.authenticated) {
  console.error("token guardado não vale mais.");
  process.exit(1);
}
console.log(`autenticado como ${sessao.user.email}`);
console.log(aplicar ? "\nMODO: aplicando\n" : "\nMODO: simulação (use --aplicar)\n");

// --- 1. a caixinha é dinheiro do dia a dia -----------------------------------

const contas = await api("/api/v1/accounts");
const caixinha = contas.find((c) => c.name === CAIXINHA);
if (!caixinha) {
  console.error(`conta "${CAIXINHA}" não encontrada.`);
  process.exit(1);
}
console.log(`1. "${CAIXINHA}" está como ${caixinha.kind}; vira checking (entra no livre para gastar)`);
console.log(`   saldo: ${brl(caixinha.balanceCents)}`);
if (aplicar && caixinha.kind !== "checking") {
  await api(`/api/v1/accounts/${caixinha.id}`, { method: "PATCH", body: { kind: "checking" } });
}

// --- 2. conta do vale --------------------------------------------------------

let vale = contas.find((c) => c.name === CONTA_VALE.nome);
console.log(`\n2. conta "${CONTA_VALE.nome}" (benefício)`);
if (vale) {
  console.log(`   já existe, saldo ${brl(vale.balanceCents)}`);
} else if (valeCentavos === null) {
  console.log("   não existe e --vale não foi informado; nada a fazer");
} else {
  console.log(`   criar com saldo de abertura ${brl(valeCentavos)}`);
  if (aplicar) {
    const criada = await api("/api/v1/accounts", {
      method: "POST",
      body: {
        name: CONTA_VALE.nome,
        kind: CONTA_VALE.kind,
        institution: CONTA_VALE.instituicao,
        includeInTotals: true,
        openingBalance: dinheiro(valeCentavos),
      },
    });
    vale = { id: criada.id };
  }
}

// --- 3. categoria de empréstimo, fora do livre para gastar -------------------

const categorias = await api("/api/v1/categories");
let emprestimo = categorias.find((c) => c.name === CATEGORIA_EMPRESTIMO && c.kind === "expense");
console.log(`\n3. categoria "${CATEGORIA_EMPRESTIMO}", marcada para não pesar na folga`);
if (emprestimo) {
  console.log("   já existe");
} else {
  console.log("   criar");
  if (aplicar) {
    // Categoria arquivada some da listagem e continua ocupando o nome. Uma
    // importação anterior desfeita deixa esses nomes presos.
    let nome = CATEGORIA_EMPRESTIMO;
    for (let tentativa = 1; tentativa <= 20 && !emprestimo; tentativa += 1) {
      try {
        const criada = await api("/api/v1/categories", {
          method: "POST",
          body: { name: nome, kind: "expense", excludeFromFreeToSpend: true },
        });
        emprestimo = { id: criada.id };
        if (nome !== CATEGORIA_EMPRESTIMO) console.log(`   nome ocupado por categoria arquivada; criada como "${nome}"`);
      } catch (erro) {
        if (!/409|duplicate/i.test(String(erro.message))) throw erro;
        nome = `${CATEGORIA_EMPRESTIMO} ${tentativa + 1}`;
      }
    }
    if (!emprestimo) throw new Error("não consegui um nome livre para a categoria de empréstimo");
  }
}

// --- 4. reclassificar as parcelas -------------------------------------------

const achatar = (t) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
const alvos = EMPRESTIMOS.map(achatar);

/**
 * Lê todos os lançamentos, em janelas de um mês.
 *
 * A rota corta em 500 por resposta e não oferece cursor. Pedir o período
 * inteiro devolvia as 500 primeiras em silêncio — e uma parcela que ficasse de
 * fora simplesmente não seria reclassificada, sem nenhum aviso.
 */
async function todosOsLancamentos(de, ate) {
  const vistos = new Map();
  for (let ano = de; ano <= ate; ano += 1) {
    for (let mes = 1; mes <= 12; mes += 1) {
      const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
      const fimMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
      const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(fimMes).padStart(2, "0")}`;
      const pagina = await api(`/api/v1/transactions?from=${inicio}&to=${fim}&limit=500`);
      if (pagina.length >= 500) {
        throw new Error(`mês ${inicio} devolveu 500 lançamentos: pode ter truncado, reduza a janela`);
      }
      for (const t of pagina) vistos.set(t.id, t);
    }
  }
  return [...vistos.values()];
}

const lancamentos = await todosOsLancamentos(2025, 2028);
console.log(`\n   (${lancamentos.length} lançamentos lidos)`);
const paraMudar = lancamentos.filter((t) => {
  if (t.origin?.kind !== "card") return false;
  const texto = achatar(t.description);
  return alvos.some((alvo) => texto.includes(alvo));
});

const total = paraMudar.reduce((s, t) => s + Math.abs(t.amountCents), 0);
console.log(`\n4. ${paraMudar.length} parcelas viram "${CATEGORIA_EMPRESTIMO}" — ${brl(total)}`);
const porNome = new Map();
for (const t of paraMudar) {
  const nome = t.description.replace(/ - Parcela.*$/i, "").trim();
  const atual = porNome.get(nome) ?? { n: 0, total: 0, confirmadas: 0, previstas: 0 };
  atual.n += 1;
  atual.total += Math.abs(t.amountCents);
  if (t.state === "planned") atual.previstas += 1;
  else atual.confirmadas += 1;
  porNome.set(nome, atual);
}
for (const [nome, v] of [...porNome].sort((a, b) => b[1].total - a[1].total)) {
  console.log(`   ${nome.padEnd(24)} ${String(v.n).padStart(2)} parcelas  ${brl(v.total).padStart(12)}  (${v.confirmadas} lançadas, ${v.previstas} previstas)`);
}

if (aplicar && emprestimo) {
  let feitas = 0;
  for (const t of paraMudar) {
    await api(`/api/v1/transactions/${t.id}`, { method: "PATCH", body: { categoryId: emprestimo.id } });
    feitas += 1;
  }
  console.log(`   ${feitas} reclassificadas`);
}

if (!aplicar) console.log("\nsimulação — nada foi alterado. Use --aplicar.");
else console.log("\n✅ ajustes aplicados.");
