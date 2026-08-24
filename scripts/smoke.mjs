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

  // --- Formato que o formulário da web envia -------------------------------
  // O campo de valor é texto digitado em pt-BR, não centavos.
  const digitado = await api("/api/v1/transactions", {
    method: "POST",
    body: {
      kind: "expense",
      description: "Cadeira de escritório",
      amount: "1.899,90",
      occurredOn: "2026-08-12",
      cardId: cartaoId,
      categoryId: alimentacao.id,
      installmentCount: 6,
    },
  });
  conferir("aceita valor digitado em pt-BR e parcela", digitado.ids.length, 6);

  const extrato = await api("/api/v1/transactions?from=2026-08-01&to=2026-08-31&limit=100");
  const cadeira = extrato.find((item) => item.description === "Cadeira de escritório");
  // 189990 / 6 = 31665, exato.
  conferir("parcela com valor exato", cadeira.amountCents, 31665);
  conferir("número da parcela é inteiro", cadeira.installmentNumber, 1);

  const parcelasCadeira = (await api("/api/v1/transactions?from=2026-08-01&to=2027-02-28&limit=200")).filter(
    (item) => item.description === "Cadeira de escritório",
  );
  conferir(
    "as 6 parcelas somam exatamente a compra",
    parcelasCadeira.reduce((soma, item) => soma + item.amountCents, 0),
    189990,
  );

  // --- Transferência -------------------------------------------------------
  const { id: poupancaId } = await api("/api/v1/accounts", {
    method: "POST",
    body: { name: "Reserva", kind: "investment", openingBalance: 0, openedOn: "2026-01-01" },
  });

  // Patrimônio antes: uma transferência move dinheiro de lugar, não cria nem
  // destrói — comparar antes e depois é o único jeito honesto de provar isso.
  const antes = await api("/api/v1/dashboard");
  const saldoAntes = antes.position.currentBalanceCents;
  const patrimonioAntes = antes.position.netWorthCents;

  await api("/api/v1/transactions", {
    method: "POST",
    body: {
      kind: "transfer",
      description: "Guardar para a reserva",
      amount: 100000,
      occurredOn: "2026-08-21",
      accountId: contaId,
      destinationAccountId: poupancaId,
    },
  });

  painel = await api("/api/v1/dashboard");
  conferir("transferência saiu da origem", painel.position.currentBalanceCents, saldoAntes - 100000);
  conferir("transferência entrou no destino como investimento", painel.position.investmentsCents, 100000);
  conferir("transferência não muda o patrimônio", painel.position.netWorthCents, patrimonioAntes);
  conferir(
    "transferência não vira despesa do mês",
    painel.categorySpend.some((item) => item.name === "Sem categoria"),
    false,
  );

  let recusouMesmaConta = false;
  try {
    await api("/api/v1/transactions", {
      method: "POST",
      body: {
        kind: "transfer",
        description: "Para si mesma",
        amount: 1000,
        occurredOn: "2026-08-21",
        accountId: contaId,
        destinationAccountId: contaId,
      },
    });
  } catch {
    recusouMesmaConta = true;
  }
  conferir("recusa transferência para a mesma conta", recusouMesmaConta, true);

  // --- Recorrências --------------------------------------------------------
  // Criar a regra não pode gravar lançamento: a projeção é derivada dela.
  const extratoAntesDaRegra = await api("/api/v1/transactions?from=2026-09-01&to=2026-09-30&limit=100");

  const { id: salarioId } = await api("/api/v1/recurrences", {
    method: "POST",
    body: {
      role: "salary",
      kind: "income",
      description: "Salário",
      amount: 520000,
      scheduleMode: "business_day_of_month",
      scheduleDay: 5,
      accountId: contaId,
      categoryId: salarioCat.id,
      startsOn: "2026-01-01",
    },
  });

  await api("/api/v1/recurrences", {
    method: "POST",
    body: {
      role: "benefit",
      kind: "income",
      description: "Vale-alimentação",
      amount: 3500,
      amountMode: "per_business_day",
      scheduleMode: "day_of_month",
      scheduleDay: 5,
      accountId: contaId,
      categoryId: salarioCat.id,
      startsOn: "2026-01-01",
    },
  });

  const extratoDepoisDaRegra = await api("/api/v1/transactions?from=2026-09-01&to=2026-09-30&limit=100");
  conferir(
    "criar recorrência não grava lançamento",
    extratoDepoisDaRegra.length,
    extratoAntesDaRegra.length,
  );

  const regras = await api("/api/v1/recurrences");
  const salario = regras.find((item) => item.id === salarioId);
  conferir("próxima ocorrência do salário", salario.next.date, "2026-09-08");

  const va = regras.find((item) => item.description === "Vale-alimentação");
  // Setembro/2026 tem 21 dias úteis: 35,00 × 21 = 735,00.
  conferir("vale-alimentação varia com os dias úteis", va.next.amountCents, 73500);

  painel = await api("/api/v1/dashboard");
  const agenda = painel.upcoming.map((item) => item.description);
  conferir("projeção do salário aparece na agenda", agenda.includes("Salário"), true);
  conferir("projeção do VA aparece na agenda", agenda.includes("Vale-alimentação"), true);

  // Confirmar torna real, e a projeção precisa sumir para não contar em dobro.
  const confirmacao = await api("/api/v1/recurrences/confirm", {
    method: "POST",
    body: { recurrenceId: salarioId, competence: "2026-09" },
  });
  conferir("confirmação usa o valor da regra", confirmacao.amountCents, 520000);

  const repetida = await api("/api/v1/recurrences/confirm", {
    method: "POST",
    body: { recurrenceId: salarioId, competence: "2026-09" },
  });
  conferir("confirmar de novo é idempotente", repetida.alreadyConfirmed, true);

  const lancamentosDeSetembro = await api("/api/v1/transactions?from=2026-09-01&to=2026-09-30&limit=100");
  conferir(
    "o salário confirmado existe uma única vez",
    lancamentosDeSetembro.filter((item) => item.description === "Salário").length,
    1,
  );

  // --- Guardas encontradas pela revisão adversarial ------------------------
  let recusouFuturo = false;
  try {
    await api("/api/v1/invoices/pay", {
      method: "POST",
      body: { cardId: cartaoId, competence: "2026-09", accountId: contaId, amount: 1000, paidOn: "2027-01-10" },
    });
  } catch {
    recusouFuturo = true;
  }
  // Aceitar data futura derrubava a dívida hoje e só tiraria o dinheiro da
  // conta depois — o patrimônio subia sozinho.
  conferir("recusa pagamento de fatura com data futura", recusouFuturo, true);

  // A transferência para a reserva não pode aparecer como saída do mês: ela só
  // mudou o dinheiro de lugar.
  const mes = painel.monthFlow;
  conferir("transferência não infla a saída do mês", mes.expenseCents, 0);

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
