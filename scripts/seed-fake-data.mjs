#!/usr/bin/env node
// scripts/seed-fake-data.mjs
//
// Popula uma instância do Fluxo com dados fictícios cobrindo todas as áreas
// do app — pra você testar sem precisar cadastrar tudo na mão. Usa a mesma
// API que o site usa (/api/auth e /api/finance), então passa pelas mesmas
// validações e cálculos de saldo/fatura que os dados reais passariam.
//
// Uso:
//   node scripts/seed-fake-data.mjs \
//     --base-url https://SEU-DEPLOY.workers.dev \
//     --email voce@email.com \
//     --password 'sua-senha'
//
// A conta (--email/--password) precisa já existir (crie pela tela normal de
// cadastro antes de rodar). Idealmente use uma conta/URL só de teste — isso
// mistura os dados fictícios com o que já existir na conta.
//
// O que é criado: 5 contas, 8 categorias, 2 cartões, 2 viagens, 3 regras
// recorrentes (salário, aluguel, assinatura), ~45 lançamentos espalhados nos
// últimos 3 meses e nos próximos 2 (incluindo dois parcelamentos em
// andamento, uma compra já paga integralmente, e uma fatura ainda em
// aberto), e 1 resgate de recompensa.

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    out[arg.slice(2)] = argv[index + 1];
    index += 1;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = (args["base-url"] || "").replace(/\/$/, "");
const email = args.email;
const password = args.password;

if (!baseUrl || !email || !password) {
  console.error("Uso: node scripts/seed-fake-data.mjs --base-url <https://...> --email <email> --password <senha>");
  process.exit(1);
}

let cookie = "";

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(options.headers || {}) },
  });
  const setCookie = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : response.headers.get("set-cookie") ? [response.headers.get("set-cookie")] : [];
  const sessionCookie = setCookie.find((value) => value.startsWith("fluxo_session="));
  if (sessionCookie) cookie = sessionCookie.split(";")[0];
  let body = null;
  try { body = await response.json(); } catch { /* sem corpo */ }
  return { ok: response.ok, status: response.status, body };
}

async function postFinance(payload, label) {
  const result = await api("/api/finance", { method: "POST", body: JSON.stringify(payload) });
  if (!result.ok) console.warn(`  ⚠ ${label}: ${result.body?.error ?? result.status}`);
  return result;
}

async function login() {
  const result = await api("/api/auth", { method: "POST", body: JSON.stringify({ action: "login", email, password }) });
  if (!result.ok) throw new Error(`Não foi possível entrar em ${baseUrl}: ${result.body?.error ?? result.status}`);
  console.log(`✓ Login ok em ${baseUrl} como ${result.body.user.email}`);
}

// ---- Datas relativas a hoje, pra ficar sempre útil independente de quando você rodar ----
const today = new Date();
function isoDate(monthOffset, day) {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, day));
  return date.toISOString().slice(0, 10);
}
function monthKey(monthOffset) {
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthOffset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  await login();

  console.log("\nContas");
  const accounts = [
    { name: "Nubank", institution: "Nubank", currency: "BRL", kind: "checking", balance: 4200, goal: 0, monthlyYieldPercent: 0, fixed: false, color: "nu" },
    { name: "Caju", institution: "Caju", currency: "BRL", kind: "benefit", balance: 380, goal: 0, monthlyYieldPercent: 0, fixed: false, color: "caju" },
    { name: "Mercado Pago", institution: "Mercado Pago", currency: "BRL", kind: "checking", balance: 150, goal: 0, monthlyYieldPercent: 0, fixed: false, color: "mp" },
    { name: "Dinheiro", institution: "Carteira", currency: "BRL", kind: "cash", balance: 120, goal: 0, monthlyYieldPercent: 0, fixed: false, color: "cash" },
    { name: "Reserva de emergência", institution: "XP Investimentos", currency: "BRL", kind: "investment", balance: 3200, goal: 12000, monthlyYieldPercent: 0.9, fixed: true, color: "xp" },
  ];
  for (const account of accounts) await postFinance({ account }, `conta "${account.name}"`);

  console.log("\nCategorias");
  const categories = [
    { name: "Salário", kind: "income", color: "green", icon: "💰", essential: false },
    { name: "Renda extra", kind: "income", color: "teal", icon: "✨", essential: false },
    { name: "Mercado", kind: "expense", color: "orange", icon: "🛒", essential: true },
    { name: "Moradia", kind: "expense", color: "blue", icon: "🏠", essential: true },
    { name: "Transporte", kind: "expense", color: "purple", icon: "🚗", essential: true },
    { name: "Saúde", kind: "expense", color: "red", icon: "💊", essential: true },
    { name: "Assinaturas", kind: "expense", color: "cyan", icon: "📺", essential: false },
    { name: "Lazer", kind: "expense", color: "pink", icon: "🎉", essential: false },
  ];
  for (const category of categories) await postFinance({ category }, `categoria "${category.name}"`);

  console.log("\nCartões");
  const cardIdMap = new Map();
  const cards = [
    { key: "nubank", name: "Nubank Ultravioleta", linkedAccount: "Nubank", kind: "credit", brand: "Mastercard", tier: "Ultravioleta", last4: "4521", limit: 8000, closingDay: 13, dueDay: 20, dueAdjustment: "next", pointsPerDollar: 1, cashbackPercent: 0, rewardMode: "points", pointsGoal: 50000, manualUsdRate: 5.4, favorite: true, color: "nu" },
    { key: "inter", name: "Inter Gold", linkedAccount: "Mercado Pago", kind: "credit", brand: "Visa", tier: "Gold", last4: "9087", limit: 3000, closingDay: 5, dueDay: 12, dueAdjustment: "next", pointsPerDollar: 0, cashbackPercent: 1.2, rewardMode: "cashback", pointsGoal: 0, manualUsdRate: 5.4, favorite: false, color: "inter" },
  ];
  for (const card of cards) {
    const { key, ...payload } = card;
    const result = await postFinance({ card: payload }, `cartão "${card.name}"`);
    if (result.ok && result.body?.card) cardIdMap.set(key, result.body.card.id);
  }

  console.log("\nViagens");
  const tripIdMap = new Map();
  const trips = [
    { key: "rio", name: "Fim de semana no Rio", startDate: isoDate(-2, 10), endDate: isoDate(-2, 13), currency: "BRL", exchangeRate: 1 },
    { key: "praia", name: "Praia em janeiro", startDate: isoDate(2, 5), endDate: isoDate(2, 12), currency: "USD", exchangeRate: 5.4 },
  ];
  for (const trip of trips) {
    const { key, ...payload } = trip;
    const result = await postFinance({ trip: payload }, `viagem "${trip.name}"`);
    if (result.ok && result.body?.trip) tripIdMap.set(key, result.body.trip.id);
  }

  console.log("\nRegras recorrentes");
  await postFinance({
    incomeRules: {
      salary: { account: "Nubank", amount: 5400, dayOfMonth: 5, scheduleMode: "business-day-of-month", dateAdjustment: "next", active: true, description: "Salário" },
      benefit: { account: "Caju", amount: 38, dayOfMonth: 1, active: true, description: "Vale-refeição/alimentação" },
    },
  }, "salário/benefício");
  const recurringRules = [
    { description: "Aluguel", category: "Moradia", account: "Nubank", amount: 1450, type: "expense", dayOfMonth: 10, scheduleMode: "day-of-month", dateAdjustment: "next", paymentMethod: "debit", active: true },
    { description: "Assinatura Netflix", category: "Assinaturas", account: "Nubank", amount: 44.9, type: "expense", dayOfMonth: 15, scheduleMode: "day-of-month", dateAdjustment: "next", paymentMethod: "credit", cardId: cardIdMap.get("nubank"), active: true },
  ];
  for (const rule of recurringRules) await postFinance({ recurringRule: rule }, `recorrência "${rule.description}"`);

  console.log("\nLançamentos");
  const transactions = [
    // Salário e VA já recebidos nos últimos meses (histórico)
    { description: "Salário", category: "Salário", account: "Nubank", date: isoDate(-2, 5), amount: 5400, type: "income", paymentMethod: "transfer", status: "confirmed" },
    { description: "Salário", category: "Salário", account: "Nubank", date: isoDate(-1, 5), amount: 5400, type: "income", paymentMethod: "transfer", status: "confirmed" },
    { description: "Salário", category: "Salário", account: "Nubank", date: isoDate(0, 5), amount: 5400, type: "income", paymentMethod: "transfer", status: "confirmed" },
    { description: "Vale-refeição", category: "Salário", account: "Caju", date: isoDate(0, 1), amount: 660, type: "income", paymentMethod: "transfer", status: "confirmed" },
    { description: "Freela de design", category: "Renda extra", account: "Mercado Pago", date: isoDate(-1, 18), amount: 800, type: "income", paymentMethod: "transfer", status: "confirmed" },

    // Débito/Pix (não passam pela fatura)
    { description: "Aluguel", category: "Moradia", account: "Nubank", date: isoDate(-2, 10), amount: 1450, type: "expense", paymentMethod: "debit", status: "confirmed" },
    { description: "Aluguel", category: "Moradia", account: "Nubank", date: isoDate(-1, 10), amount: 1450, type: "expense", paymentMethod: "debit", status: "confirmed" },
    { description: "Aluguel", category: "Moradia", account: "Nubank", date: isoDate(0, 10), amount: 1450, type: "expense", paymentMethod: "debit", status: "confirmed" },
    { description: "Pix - Farmácia", category: "Saúde", account: "Nubank", date: isoDate(0, 3), amount: 64.3, type: "expense", paymentMethod: "debit", status: "confirmed" },
    { description: "Conta de luz", category: "Moradia", account: "Nubank", date: isoDate(0, 8), amount: 210.45, type: "expense", paymentMethod: "debit", status: "confirmed" },
    { description: "Feira livre", category: "Mercado", account: "Dinheiro", date: isoDate(0, 6), amount: 65, type: "expense", paymentMethod: "cash", status: "confirmed" },
    { description: "Uber", category: "Transporte", account: "Mercado Pago", date: isoDate(0, 12), amount: 28.9, type: "expense", paymentMethod: "debit", status: "confirmed" },
    { description: "Transferência p/ Caju", category: "Moradia", account: "Nubank", destinationAccount: "Caju", date: isoDate(0, 2), amount: 300, type: "transfer", paymentMethod: "transfer", status: "confirmed" },

    // Compras normais no crédito Nubank (mês corrente + anterior), com paymentMethod credit e invoiceMonth
    { description: "Supermercado Extra", category: "Mercado", account: "Nubank", date: isoDate(0, 4), amount: 380.6, type: "expense", paymentMethod: "credit", cardId: cardIdMap.get("nubank"), invoiceMonth: monthKey(0), status: "confirmed" },
    { description: "Posto Shell", category: "Transporte", account: "Nubank", date: isoDate(0, 9), amount: 180, type: "expense", paymentMethod: "credit", cardId: cardIdMap.get("nubank"), invoiceMonth: monthKey(0), status: "confirmed" },
    { description: "Assinatura Netflix", category: "Assinaturas", account: "Nubank", date: isoDate(0, 15), amount: 44.9, type: "expense", paymentMethod: "credit", cardId: cardIdMap.get("nubank"), invoiceMonth: monthKey(1), status: "confirmed", source: "recurring" },
    { description: "Cinema", category: "Lazer", account: "Nubank", date: isoDate(0, 14), amount: 76, type: "expense", paymentMethod: "credit", cardId: cardIdMap.get("nubank"), invoiceMonth: monthKey(1), status: "confirmed" },
    { description: "Supermercado Extra", category: "Mercado", account: "Nubank", date: isoDate(-1, 4), amount: 420.15, type: "expense", paymentMethod: "credit", cardId: cardIdMap.get("nubank"), invoiceMonth: monthKey(-1), status: "confirmed" },
    { description: "Farmácia", category: "Saúde", account: "Nubank", date: isoDate(-1, 20), amount: 95.5, type: "expense", paymentMethod: "credit", cardId: cardIdMap.get("nubank"), invoiceMonth: monthKey(0), status: "confirmed" },

    // Compras no cartão Inter (ciclo diferente, fechamento dia 5)
    { description: "Livraria", category: "Lazer", account: "Mercado Pago", date: isoDate(0, 2), amount: 89.9, type: "expense", paymentMethod: "credit", cardId: cardIdMap.get("inter"), invoiceMonth: monthKey(0), status: "confirmed" },
    { description: "Restaurante", category: "Lazer", account: "Mercado Pago", date: isoDate(0, 7), amount: 145, type: "expense", paymentMethod: "credit", cardId: cardIdMap.get("inter"), invoiceMonth: monthKey(1), status: "confirmed" },

    // (o pagamento da fatura do mês anterior é feito depois, via payInvoice — ver abaixo)

    // Gastos na viagem do Rio
    { description: "Hotel no Rio", category: "Lazer", account: "Nubank", date: isoDate(-2, 10), amount: 620, type: "expense", paymentMethod: "credit", cardId: cardIdMap.get("nubank"), invoiceMonth: monthKey(-1), tripId: tripIdMap.get("rio"), status: "confirmed" },
    { description: "Jantar no Rio", category: "Lazer", account: "Nubank", date: isoDate(-2, 11), amount: 180, type: "expense", paymentMethod: "credit", cardId: cardIdMap.get("nubank"), invoiceMonth: monthKey(-1), tripId: tripIdMap.get("rio"), status: "confirmed" },
  ];

  // Parcelamento 1: notebook em 10x, comprado há 3 meses (algumas parcelas já pagas)
  const notebookTotal = 3200, notebookInstallments = 10, notebookEach = notebookTotal / notebookInstallments;
  const notebookGroupId = "seed-notebook";
  for (let i = 0; i < notebookInstallments; i += 1) {
    transactions.push({
      description: "Notebook Dell", category: "Lazer", account: "Nubank", date: isoDate(-3 + i, 18),
      amount: Math.round(notebookEach * 100) / 100, type: "expense", paymentMethod: "credit",
      cardId: cardIdMap.get("nubank"), invoiceMonth: monthKey(-2 + i),
      installments: `${i + 1}/${notebookInstallments}`, installmentGroupId: notebookGroupId, status: "confirmed",
    });
  }

  // Parcelamento 2: geladeira em 6x, comprada este mês (nenhuma parcela paga ainda)
  const geladeiraTotal = 2400, geladeiraInstallments = 6, geladeiraEach = geladeiraTotal / geladeiraInstallments;
  const geladeiraGroupId = "seed-geladeira";
  for (let i = 0; i < geladeiraInstallments; i += 1) {
    transactions.push({
      description: "Geladeira Brastemp", category: "Moradia", account: "Nubank", date: isoDate(0, 16),
      amount: Math.round(geladeiraEach * 100) / 100, type: "expense", paymentMethod: "credit",
      cardId: cardIdMap.get("nubank"), invoiceMonth: monthKey(1 + i),
      installments: `${i + 1}/${geladeiraInstallments}`, installmentGroupId: geladeiraGroupId, status: "confirmed",
    });
  }

  // Compromissos futuros (Planejamento / Próximos vencimentos)
  transactions.push(
    { description: "Financiamento do carro", category: "Transporte", account: "Nubank", date: isoDate(1, 18), amount: 890, type: "expense", paymentMethod: "debit", status: "confirmed" },
    { description: "IPTU (parcela)", category: "Moradia", account: "Nubank", date: isoDate(2, 10), amount: 320, type: "expense", paymentMethod: "debit", status: "confirmed" },
  );

  transactions.sort((a, b) => a.date.localeCompare(b.date));
  let done = 0;
  for (const transaction of transactions) {
    await postFinance({ transaction }, `lançamento "${transaction.description}" (${transaction.date})`);
    done += 1;
  }
  console.log(`  ${done} lançamentos criados`);

  console.log("\nPagamento de fatura (deixando a do mês atual em aberto de propósito)");
  await postFinance({
    payInvoice: { cardId: cardIdMap.get("nubank"), invoiceMonth: monthKey(-1), sourceAccount: "Nubank", date: isoDate(0, 1) },
  }, "pagamento da fatura anterior do Nubank");

  console.log("\nResgate de recompensa");
  await postFinance({
    rewardRedemption: { cardId: cardIdMap.get("nubank"), kind: "points", amount: 8000, account: "Nubank", redeemedAt: isoDate(-1, 22), note: "Troca por milhas Livelo" },
  }, "resgate de pontos");

  console.log("\nSeed concluído. Abra o app e confira Dashboard, Parcelamentos, Lançamentos, Cartões, Viagens e Planejamento.");
}

main().catch((error) => {
  console.error(`\nFalha ao gerar dados fictícios: ${error.message}`);
  process.exit(1);
});
