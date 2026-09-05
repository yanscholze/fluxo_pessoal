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

/**
 * Cada rodada cria o próprio usuário e apaga só o que criou.
 *
 * O usuário descartável é isolamento, não descuido: rodar sobre a conta de
 * demonstração corromperia os números que ela existe para mostrar. O que
 * faltava era a outra metade — vinte e uma rodadas tinham deixado vinte e um
 * usuários no banco local, cada um com contas e lançamentos que ninguém mais
 * ia olhar.
 *
 * A limpeza só acontece no banco local do Miniflare, e só quando o alvo é
 * localhost: contra um servidor de verdade não há arquivo para abrir, e apagar
 * usuário por fora do produto seria exatamente o tipo de atalho que este
 * script existe para não precisar.
 */
async function limpar(email) {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) return;

  try {
    const { readdirSync } = await import("node:fs");
    const { DatabaseSync } = await import("node:sqlite");
    const pasta = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
    const arquivo = readdirSync(pasta).find((nome) => nome.endsWith(".sqlite"));
    if (!arquivo) return;

    const banco = new DatabaseSync(`${pasta}/${arquivo}`);
    // As tabelas apontam para `users` com `on delete cascade`: apagar o
    // usuário leva junto contas, cartões, lançamentos e sessões.
    const { changes } = banco.prepare("delete from users where email = ?").run(email);
    banco.close();
    if (changes) console.log(`\n  (usuário de teste ${email} removido do banco local)`);
  } catch {
    // Limpeza é conveniência. Falhar aqui não invalida a verificação que já
    // passou, e mascarar o resultado dela por causa disso seria pior.
  }
}

let token = null;
let falhas = 0;
let verificacoes = 0;
/** Guardado fora de `main` para a limpeza alcançá-lo mesmo se algo estourar. */
let emailDoTeste = null;

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

function conferir(rotulo, obtido, esperado, detalhe) {
  verificacoes += 1;
  if (obtido === esperado) {
    console.log(`  ok  ${rotulo}: ${obtido}`);
    return;
  }
  falhas += 1;
  // O detalhe sai só na falha: "obtido rejected" sem o motivo obriga quem lê a
  // reproduzir a chamada à mão para descobrir o que o servidor recusou.
  console.error(
    `  FALHA  ${rotulo}: esperado ${esperado}, obtido ${obtido}` +
      (detalhe === undefined ? "" : ` — ${typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe)}`),
  );
}

function real(centavos) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function main() {
  console.log(`Verificando ${BASE}\n`);

  // --- Cadastro ------------------------------------------------------------
  const email = `smoke-${Date.now()}@fluxo.teste`;
  emailDoTeste = email;
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
      rewardMode: "both",
      pointsPerDollarMilli: 1500,
      cashbackBasisPoints: 150,
      pointsGoal: 50000,
      manualUsdRateMicros: 5000000,
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

  // --- Recompensas ---------------------------------------------------------
  const recompensas = await api("/api/v1/rewards");
  const cartaoRecompensa = recompensas.cards.find((item) => item.cardId === cartaoId);
  conferir("cartão com recompensa aparece", Boolean(cartaoRecompensa), true);

  // Só fatura fechada rende: a compra de 20/08 caiu na fatura de setembro, que
  // ainda está aberta, então o saldo dela fica pendente.
  conferir(
    "compra em fatura aberta não vira saldo resgatável",
    cartaoRecompensa.balance.pendingCashbackCents > 0,
    true,
  );

  // Cashback é 1,5% — o mesmo percentual, qualquer que seja a cotação.
  const somaCashback = cartaoRecompensa.entries.reduce((soma, item) => soma + item.cashbackCents, 0);
  const somaCompras = cartaoRecompensa.entries.reduce((soma, item) => soma + item.amountCents, 0);
  conferir("cashback é 1,5% das compras", somaCashback, Math.round((somaCompras * 150) / 10_000));

  // Cada parcela rende sobre o próprio valor, não sobre o total da compra.
  const parcelas = cartaoRecompensa.entries.filter((item) => item.description === "Fone de ouvido");
  conferir("as 3 parcelas renderam separadamente", parcelas.length, 3);
  conferir(
    "cashback da parcela é sobre o valor dela",
    parcelas[0].cashbackCents,
    Math.round((parcelas[0].amountCents * 150) / 10_000),
  );

  let recusouResgateAlto = false;
  try {
    await api("/api/v1/rewards", {
      method: "POST",
      body: { cardId: cartaoId, kind: "cashback", amount: 999999, accountId: contaId },
    });
  } catch {
    recusouResgateAlto = true;
  }
  conferir("recusa resgate acima do saldo", recusouResgateAlto, true);

  // --- Assistente ----------------------------------------------------------
  const assistente = await api("/api/v1/assistant");
  conferir("cota diária do assistente exposta", assistente.advice.limit, 60);
  conferir("cota diária de leitura de cupom exposta", assistente.receipt.limit, 30);

  // Sem OPENAI_API_KEY o app funciona normal, só sem as duas features de IA —
  // e a tentativa não pode queimar a cota de algo que nunca rodou.
  if (!assistente.configured) {
    let recusouSemChave = false;
    try {
      await api("/api/v1/assistant", { method: "POST", body: { question: "Posso gastar 500 reais?" } });
    } catch {
      recusouSemChave = true;
    }
    conferir("recusa consulta sem chave configurada", recusouSemChave, true);

    const depois = await api("/api/v1/assistant");
    conferir("tentativa sem chave não consome cota", depois.advice.used, 0);
  }

  let recusouImagemInvalida = false;
  try {
    await api("/api/v1/receipts", { method: "POST", body: { image: "isso-nao-e-uma-imagem" } });
  } catch {
    recusouImagemInvalida = true;
  }
  conferir("recusa arquivo que não é imagem", recusouImagemInvalida, true);

  // --- Captura por notificação ----------------------------------------------
  const agora = Date.now();
  const notificacoes = [
    { sourceApp: "com.nu.production", title: "Compra aprovada", text: "Compra de R$ 42,90 em PADARIA CENTRAL no débito", postedAt: agora - 1000, deviceEventId: "s1" },
    { sourceApp: "com.nu.production", title: "Compra aprovada", text: "Compra de R$ 289,90 em MAGAZINE LUIZA em 3x no crédito", postedAt: agora - 2000, deviceEventId: "s2" },
    { sourceApp: "com.nu.production", title: "Nubank", text: "Seu saldo é de R$ 1.234,56", postedAt: agora - 3000, deviceEventId: "s3" },
    { sourceApp: "com.samsung.android.spay", title: "Samsung Pay", text: "Compra de R$ 42,90 em PADARIA CENTRAL", postedAt: agora - 1500, deviceEventId: "s4" },
    { sourceApp: "com.zap.delivery", title: "Promo", text: "R$ 20,00 de desconto", postedAt: agora - 5000, deviceEventId: "s5" },
    { sourceApp: "com.nu.production", title: "Compra aprovada", text: "Compra de R$ 42,90 em PADARIA CENTRAL no débito", postedAt: agora - 500, deviceEventId: "s6" },
  ];

  const captura = await api("/api/v1/captures", { method: "POST", body: { notifications: notificacoes } });
  conferir("captura só o que é transação de app confiável", captura.captured, 2);

  // "Seu saldo é de R$ 1.234,56" virando despesa é o pior erro possível: o
  // valor é grande e plausível, e o usuário demora a notar.
  conferir("aviso de saldo não vira lançamento", captura.reasons.nao_e_transacao, 1);
  // A carteira espelha a notificação do banco; aceitar as duas duplicaria tudo.
  conferir("app de carteira é ignorado", captura.reasons.carteira, 1);
  conferir("app desconhecido é ignorado", captura.reasons.app_nao_confiavel, 1);
  conferir("mesma compra na janela é duplicada", captura.duplicated, 1);

  const reenvio = await api("/api/v1/captures", { method: "POST", body: { notifications: notificacoes } });
  conferir("reenvio da fila não recria sugestões", reenvio.captured, 0);

  const fila = await api("/api/v1/captures");
  const parcelada = fila.pending.find((item) => item.amountCents === 28990);
  conferir("reconhece parcelamento na notificação", parcelada?.installment?.total, 3);
  conferir("infere crédito pelo texto", parcelada?.method, "credit");

  const aVista = fila.pending.find((item) => item.amountCents === 4290);
  conferir("corta a forma de pagamento do estabelecimento", aVista?.description, "PADARIA CENTRAL");

  const confirmada = await api("/api/v1/captures", {
    method: "PATCH",
    body: { captureId: aVista.id, decision: "confirmar", accountId: contaId },
  });
  conferir("confirmar a sugestão cria lançamento", Boolean(confirmada.transactionId), true);

  const filaDepois = await api("/api/v1/captures");
  conferir("sugestão confirmada sai da fila", filaDepois.pending.length, fila.pending.length - 1);

  // --- Sessão web ------------------------------------------------------------
  // As rotas foram exercitadas com token de dispositivo; o pareamento e as
  // páginas precisam do cookie, que é outro caminho de autenticação.
  const entrada = await fetch(`${BASE}/api/v1/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "signin", email, password: "senha-de-teste-123", kind: "web" }),
  });
  const sessaoWeb = (entrada.headers.get("set-cookie") ?? "").split(";")[0];
  conferir("sessão web emitida por cookie", sessaoWeb.startsWith("fluxo_session="), true);

  // --- Pareamento e sincronização -------------------------------------------
  const anonimo = async (metodo, corpo) => {
    const resposta = await fetch(`${BASE}/api/v1/pairing`, {
      method: metodo,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    return { status: resposta.status, corpo: await resposta.json().catch(() => ({})) };
  };

  const inicio = await anonimo("POST", {
    deviceId: "smoke-device-0001",
    deviceName: "Aparelho de teste",
    platform: "android",
  });
  conferir("aparelho recebe código de pareamento", inicio.corpo.data?.code?.length, 6);

  const { code, pollToken } = inicio.corpo.data;

  const pendente = await anonimo("PUT", { code, pollToken });
  conferir("pareamento começa pendente", pendente.corpo.data?.status, "pendente");

  // Quem só viu o código na tela não pode resgatar em nome do aparelho.
  const bisbilhoteiro = await anonimo("PUT", { code, pollToken: "01M0V000000000000000000000" });
  conferir("recusa resgate sem o segredo do aparelho", bisbilhoteiro.status, 409);

  const aprovacao = await fetch(`${BASE}/api/v1/pairing`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: sessaoWeb },
    body: JSON.stringify({ code }),
  });
  conferir("usuário autentica o aparelho pelo navegador", aprovacao.status, 200);

  const resgate = await anonimo("PUT", { code, pollToken });
  conferir("aparelho resgata o token", resgate.corpo.data?.status, "aprovado");
  const tokenDoAparelho = resgate.corpo.data.token;

  // O código é de uso único: um pedido resgatável para sempre viraria uma
  // chave permanente escondida no banco.
  const segundoResgate = await anonimo("PUT", { code, pollToken });
  conferir("código não pode ser resgatado duas vezes", segundoResgate.status, 404);

  const sincronizar = async (corpo) => {
    const resposta = await fetch(`${BASE}/api/v1/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${tokenDoAparelho}` },
      body: JSON.stringify({ protocolVersion: 1, device: { id: "smoke-device-0001" }, ...corpo }),
    });
    const json = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(`sync ${resposta.status}: ${JSON.stringify(json?.error)}`);
    return json.data;
  };

  const primeira = await sincronizar({ mutations: [], cursor: null });
  conferir("primeira sincronização traz o catálogo", primeira.catalog?.accounts?.length > 0, true);
  conferir("primeira sincronização traz os lançamentos", primeira.changes.length > 0, true);

  // Identificadores próprios desta execução. Fixos, eles pertenceriam ao
  // usuário da execução anterior no mesmo banco — e o servidor recusaria a
  // gravação, corretamente, por identificador de outro dono.
  const marca = Date.now().toString(36).toUpperCase().padStart(9, "0");
  const idDeSincronizacao = (sufixo) => `01M0V${marca}SMOKE${sufixo.padStart(6, "0")}`;

  const idDeTeste = idDeSincronizacao("2");
  const criacao = await sincronizar({
    cursor: primeira.cursor,
    mutations: [
      {
        mutationId: idDeSincronizacao("1"),
        entity: "transaction",
        entityId: idDeTeste,
        operation: "upsert",
        baseVersion: 0,
        data: {
          id: idDeTeste,
          kind: "expense",
          description: "Café pelo celular",
          amount: "8,50",
          occurredOn: "2026-08-25",
          accountId: contaId,
        },
      },
    ],
  });
  conferir("aparelho cria lançamento offline", criacao.results[0].status, "applied", criacao.results[0].message);

  // Resposta perdida no caminho: o aparelho reenvia e não pode gravar duas vezes.
  const reenvioSync = await sincronizar({
    cursor: primeira.cursor,
    mutations: [
      {
        mutationId: idDeSincronizacao("1"),
        entity: "transaction",
        entityId: idDeTeste,
        operation: "upsert",
        baseVersion: 0,
        data: { id: idDeTeste, kind: "expense", description: "Café pelo celular", amount: "8,50", occurredOn: "2026-08-25", accountId: contaId },
      },
    ],
  });
  conferir("reenvio da mutação é idempotente", reenvioSync.results[0].status, "duplicate");

  // Editar sobre versão antiga não pode sobrescrever em silêncio.
  const conflito = await sincronizar({
    cursor: primeira.cursor,
    mutations: [
      {
        mutationId: idDeSincronizacao("3"),
        entity: "transaction",
        entityId: idDeTeste,
        operation: "upsert",
        baseVersion: 99,
        data: { id: idDeTeste, kind: "expense", description: "Sobrescrita", amount: "99,00", occurredOn: "2026-08-25", accountId: contaId },
      },
    ],
  });
  conferir("versão base errada vira conflito", conflito.results[0].status, "conflict");
  conferir("conflito devolve o estado do servidor", conflito.results[0].current?.description, "Café pelo celular");

  const exclusaoFantasma = await sincronizar({
    cursor: primeira.cursor,
    mutations: [
      {
        mutationId: idDeSincronizacao("4"),
        entity: "transaction",
        entityId: idDeSincronizacao("99"),
        operation: "delete",
        baseVersion: 0,
      },
    ],
  });
  conferir("apagar o que nunca existiu não é erro", exclusaoFantasma.results[0].status, "noop");

  // --- Telas ---------------------------------------------------------------
  // Um serviço que quebra derruba a página inteira; render é a única prova de
  // que a pilha toda — rota, serviço, domínio, banco — chega até o HTML.
  const paginas = [
    "/",
    "/lancamentos",
    "/contas",
    "/cartoes",
    "/parcelamentos",
    "/recompensas",
    "/planejamento",
    "/orcamentos",
    "/metas",
    "/assinaturas",
    "/investimentos",
    "/viagens",
    "/saude",
    "/relatorios",
    "/relatorios/despesas",
    "/relatorios/renda",
    "/relatorios/assinaturas",
    "/projetos",
    "/projetos/quadro",
    "/projetos/agenda",
    "/projetos/horas",
    "/importar",
    "/automaticos",
    "/conectar",
    "/assistente",
    "/configuracoes",
  ];

  let renderizaram = 0;
  const quebradas = [];
  for (const caminho of paginas) {
    const resposta = await fetch(`${BASE}${caminho}`, { headers: { cookie: sessaoWeb } });
    if (resposta.ok) renderizaram += 1;
    else quebradas.push(`${caminho} (${resposta.status})`);
  }
  conferir(
    quebradas.length ? `telas renderizam — quebradas: ${quebradas.join(", ")}` : "todas as telas renderizam",
    renderizaram,
    paginas.length,
  );

  console.log("\n5. Livre para gastar:");
  const livre = painel.freeToSpend;
  console.log(`     saldo hoje          ${real(livre.liquidBalanceCents)}`);
  console.log(`     a receber no ciclo  ${real(livre.pendingIncomeCents)}`);
  console.log(`     faturas em aberto  −${real(livre.openInvoicesCents)}`);
  console.log(`     contas previstas   −${real(livre.otherCommitmentsCents)}`);
  console.log(`     ─────────────────────────────`);
  // A folga é o menor saldo projetado do horizonte, não a soma das linhas
  // acima: elas dizem o que pesa, a ordem dos vencimentos é que decide.
  console.log(`     livre para gastar   ${real(livre.amountCents)}`);
  console.log(`     aperto em           ${livre.lowestOn}`);
  console.log(`     ciclo ${livre.windowStart} a ${livre.windowEnd} · horizonte até ${livre.horizonEnd}`);

  await limpar(emailDoTeste);

  console.log(
    `\n${verificacoes - falhas}/${verificacoes} verificações passaram${falhas ? ` — ${falhas} FALHA(S)` : ""}`,
  );
  process.exit(falhas ? 1 : 0);
}

main().catch(async (erro) => {
  // Limpa também quando falhou: a rodada interrompida deixa o mesmo lixo.
  if (emailDoTeste) await limpar(emailDoTeste);
  console.error(`\nErro: ${erro.message}`);
  process.exit(1);
});
