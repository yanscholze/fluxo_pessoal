/**
 * Verificação de ponta a ponta contra o servidor rodando.
 *
 * Exercita a pilha inteira — HTTP, autenticação, serviço, domínio, banco — e
 * confere os números que a Visão geral mostra. Teste de unidade prova que a
 * regra está certa; este prova que ela chega até a tela.
 *
 * Uso: `node scripts/smoke.mjs [http://localhost:5173]`
 */

const BASE = process.argv[2] ?? "http://localhost:5173";

let token = null;
let falhas = 0;
let verificacoes = 0;

async function api(caminho, { method = "GET", body } = {}) {
  const resposta = await fetch(`${BASE}${caminho}`, {
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
    throw new Error(
      `${method} ${caminho} devolveu ${resposta.status}: ${JSON.stringify(corpo?.error ?? corpo)}`,
    );
  }
  return corpo?.data;
}

function conferir(rotulo, obtido, esperado) {
  verificacoes += 1;
  if (obtido === esperado) {
    console.log(`  ok  ${rotulo}: ${obtido}`);
    return;
  }
  falhas += 1;
  console.error(`  FALHA  ${rotulo}: esperado ${esperado}, obtido ${obtido}`);
}

function real(centavos) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function main() {
  console.log(`Verificando ${BASE}\n`);

  // --- Cadastro ------------------------------------------------------------
  const email = `smoke-${Date.now()}@fluxo.teste`;
  const cadastro = await api("/api/v1/session", {
    method: "POST",
    body: { action: "signup", email, password: "senha-de-teste-123", displayName: "Teste Silva", kind: "device" },
  });
  token = cadastro.token;
  if (!token) throw new Error("cadastro não devolveu token de dispositivo");
  console.log("1. Conta criada e sessão de dispositivo emitida");

  const categorias = await api("/api/v1/categories");
  conferir("categorias padrão criadas", categorias.length, 9);
  const alimentacao = categorias.find((item) => item.name === "Alimentação");
  const salarioCat = categorias.find((item) => item.name === "Salário");

  // --- Cadastros -----------------------------------------------------------
  const { id: contaId } = await api("/api/v1/accounts", {
    method: "POST",
    body: { name: "Nubank", kind: "checking", openingBalance: 300000, openedOn: "2026-01-01" },
  });

  const { id: cartaoId } = await api("/api/v1/cards", {
    method: "POST",
    body: {
      name: "Nubank Roxinho",
      kind: "credit",
      paymentAccountId: contaId,
      closingDay: 13,
      dueDay: 20,
      limit: 500000,
    },
  });
  console.log("2. Conta e cartão cadastrados (fecha dia 13, vence dia 20)");

  // --- Lançamentos ---------------------------------------------------------
  await api("/api/v1/transactions", {
    method: "POST",
    body: {
      kind: "income",
      description: "Salário",
      amount: 500000,
      occurredOn: "2026-08-05",
      accountId: contaId,
      categoryId: salarioCat.id,
    },
  });

  // 10/08 é anterior ao fechamento (13/08): cai na competência de agosto.
  const antesDoFechamento = await api("/api/v1/transactions", {
    method: "POST",
    body: {
      kind: "expense",
      description: "Mercado",
      amount: 120000,
      occurredOn: "2026-08-10",
      cardId: cartaoId,
      categoryId: alimentacao.id,
    },
  });
  conferir("compra em 10/08 cai na competência", antesDoFechamento.competence, "2026-08");

  // 20/08 é posterior ao fechamento: cai em setembro.
  const depoisDoFechamento = await api("/api/v1/transactions", {
    method: "POST",
    body: {
      kind: "expense",
      description: "Farmácia",
      amount: 30000,
      occurredOn: "2026-08-20",
      cardId: cartaoId,
      categoryId: alimentacao.id,
    },
  });
  conferir("compra em 20/08 cai na competência seguinte", depoisDoFechamento.competence, "2026-09");

  const parcelado = await api("/api/v1/transactions", {
    method: "POST",
    body: {
      kind: "expense",
      description: "Fone de ouvido",
      amount: 120000,
      occurredOn: "2026-08-10",
      cardId: cartaoId,
      categoryId: alimentacao.id,
      installmentCount: 3,
    },
  });
  conferir("parcelamento gerou 3 lançamentos", parcelado.ids.length, 3);
  console.log("3. Lançamentos registrados (receita, 2 compras, 1 parcelamento 3x)");

  // --- Estado antes do pagamento -------------------------------------------
  let painel = await api("/api/v1/dashboard");

  conferir("saldo da conta ignora compra no crédito", painel.position.currentBalanceCents, 800000);

  const cartao = painel.cards.find((item) => item.id === cartaoId);
  const agosto = cartao.currentInvoice.competence === "2026-08" ? cartao.currentInvoice : cartao.overdueInvoices[0];
  conferir("fatura de agosto = 1200 + 400 da 1ª parcela", agosto.chargesCents, 160000);
  conferir("fatura de agosto vence em", agosto.dueDate, "2026-08-20");

  const setembro = cartao.currentInvoice.competence === "2026-09" ? cartao.currentInvoice : null;
  conferir("fatura de setembro = 300 + 400 da 2ª parcela", setembro?.chargesCents, 70000);

  // Mercado 1200 + Farmácia 300 + parcelamento 1200 = 2700 em três faturas.
  conferir("dívida total do cartão", painel.position.cardDebtCents, 270000);
  conferir("limite disponível desconta parcelas futuras", cartao.availableLimitCents, 500000 - 270000);
  conferir("patrimônio = ativos − dívida", painel.position.netWorthCents, 800000 - 270000);

  // --- Pagamento de fatura -------------------------------------------------
  const pagamento = await api("/api/v1/invoices/pay", {
    method: "POST",
    body: { cardId: cartaoId, competence: "2026-08", accountId: contaId, paidOn: "2026-08-20" },
  });
  conferir("pagou o total em aberto da fatura", pagamento.paidCents, 160000);
  conferir("não restou nada da fatura", pagamento.remainingCents, 0);
  console.log("4. Fatura de agosto paga");

  painel = await api("/api/v1/dashboard");
  const cartaoDepois = painel.cards.find((item) => item.id === cartaoId);

  conferir("pagamento saiu da conta", painel.position.currentBalanceCents, 640000);
  conferir("dívida caiu para as faturas seguintes", painel.position.cardDebtCents, 270000 - 160000);
  conferir("limite voltou proporcionalmente", cartaoDepois.availableLimitCents, 500000 - 110000);
  conferir("agosto não aparece mais em atraso", cartaoDepois.overdueInvoices.length, 0);

  // Pagar de novo precisa ser recusado.
  let recusou = false;
  try {
    await api("/api/v1/invoices/pay", {
      method: "POST",
      body: { cardId: cartaoId, competence: "2026-08", accountId: contaId },
    });
  } catch {
    recusou = true;
  }
  conferir("recusa pagar fatura já quitada", recusou, true);

  // Compra no crédito sem cartão precisa ser recusada, não adivinhada.
  let recusouAdivinhar = false;
  try {
    await api("/api/v1/transactions", {
      method: "POST",
      body: { kind: "expense", description: "Sem origem", amount: 1000, occurredOn: "2026-08-10" },
    });
  } catch {
    recusouAdivinhar = true;
  }
  conferir("recusa lançamento sem conta nem cartão", recusouAdivinhar, true);

  console.log("\n5. Livre para gastar:");
  const livre = painel.freeToSpend;
  console.log(`     saldo hoje          ${real(livre.liquidBalanceCents)}`);
  console.log(`     a receber no ciclo  ${real(livre.pendingIncomeCents)}`);
  console.log(`     faturas em aberto  −${real(livre.openInvoicesCents)}`);
  console.log(`     contas previstas   −${real(livre.otherCommitmentsCents)}`);
  console.log(`     ─────────────────────────────`);
  console.log(`     livre para gastar   ${real(livre.amountCents)}`);
  console.log(`     ciclo ${livre.windowStart} a ${livre.windowEnd}`);

  console.log(
    `\n${verificacoes - falhas}/${verificacoes} verificações passaram${falhas ? ` — ${falhas} FALHA(S)` : ""}`,
  );
  process.exit(falhas ? 1 : 0);
}

main().catch((erro) => {
  console.error(`\nErro: ${erro.message}`);
  process.exit(1);
});
