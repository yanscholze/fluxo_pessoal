/**
 * Popula uma conta de demonstração com dados fictícios.
 *
 * Fala com a API de verdade, pelos mesmos caminhos que a interface usa — então
 * o que aparece na tela passou pelas mesmas validações e pelo mesmo domínio.
 * Um seed que escreve direto no banco produziria estados impossíveis de
 * alcançar pelo app.
 *
 * Uso: `node scripts/seed-demo.mjs [http://localhost:5173]`
 */

const BASE = process.argv[2] ?? "http://localhost:5173";

const EMAIL = "demo@fluxo.app";
const SENHA = "demonstracao123";
const NOME = "Yan Augusto";

/** Referência de "hoje" no cenário. Mantém o seed reproduzível. */
const HOJE = new Date();

let cookie = "";

async function api(caminho, { method = "GET", body } = {}) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
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

/** `YYYY-MM-DD` a partir de um deslocamento em meses e um dia do mês. */
function dia(mesesAtras, diaDoMes) {
  const data = new Date(Date.UTC(HOJE.getUTCFullYear(), HOJE.getUTCMonth() - mesesAtras, diaDoMes, 12));
  return data.toISOString().slice(0, 10);
}

/** Uma transação no formato OFX, que é posicional e sem espaço para engano. */
function linhaOfx(tipo, data, centavos, memo, id) {
  const valor = (centavos / 100).toFixed(2);
  return [
    "<STMTTRN>",
    `<TRNTYPE>${tipo}`,
    `<DTPOSTED>${data.replace(/-/g, "")}120000`,
    `<TRNAMT>${valor}`,
    `<FITID>${id}`,
    `<MEMO>${memo}`,
    "</STMTTRN>",
  ].join("\n");
}

function competencia(mesesAtras) {
  const data = new Date(Date.UTC(HOJE.getUTCFullYear(), HOJE.getUTCMonth() - mesesAtras, 1, 12));
  return data.toISOString().slice(0, 7);
}

async function entrar() {
  // Conta nova na primeira execução; nas seguintes só entra.
  try {
    await api("/api/v1/session", {
      method: "POST",
      body: { action: "signup", email: EMAIL, password: SENHA, displayName: NOME, kind: "web" },
    });
    return true;
  } catch (erro) {
    if (!String(erro).includes("Já existe")) throw erro;
    await api("/api/v1/session", {
      method: "POST",
      body: { action: "signin", email: EMAIL, password: SENHA, kind: "web" },
    });
    return false;
  }
}

async function main() {
  console.log(`Populando ${BASE}\n`);

  const nova = await entrar();
  if (!nova) {
    console.log("A conta de demonstração já existe. Nada a fazer.");
    console.log(`\n  ${BASE}/entrar\n  e-mail: ${EMAIL}\n  senha:  ${SENHA}\n`);
    return;
  }

  // --- Categorias ----------------------------------------------------------
  const categorias = await api("/api/v1/categories");
  const idDe = (nome) => categorias.find((item) => item.name === nome)?.id;

  for (const extra of [
    { name: "Educação", kind: "expense" },
    { name: "Pets", kind: "expense" },
    { name: "Freelance", kind: "income" },
  ]) {
    const { id } = await api("/api/v1/categories", { method: "POST", body: extra });
    categorias.push({ ...extra, id });
  }

  // Essenciais alimentam o alvo da reserva de emergência.
  for (const nome of ["Moradia", "Alimentação", "Transporte", "Saúde"]) {
    await api(`/api/v1/categories/${idDe(nome)}`, {
      method: "PATCH",
      body: { isEssential: "true" },
    });
  }

  console.log("1. Categorias");

  // --- Contas e cartões ----------------------------------------------------
  const conta = (
    await api("/api/v1/accounts", {
      method: "POST",
      body: {
        name: "Nubank",
        kind: "checking",
        institution: "Nu Pagamentos",
        openingBalance: 210000,
        openedOn: dia(7, 1),
        color: "#7c5cff",
      },
    })
  ).id;

  const va = (
    await api("/api/v1/accounts", {
      method: "POST",
      body: { name: "Caju VA", kind: "benefit", institution: "Caju", openingBalance: 0, openedOn: dia(7, 1), color: "#fb923c" },
    })
  ).id;

  const reserva = (
    await api("/api/v1/accounts", {
      method: "POST",
      body: {
        name: "Reserva",
        kind: "investment",
        institution: "Nu Invest",
        openingBalance: 1180000,
        openedOn: dia(7, 1),
        goalAmount: 3000000,
        monthlyYieldBasisPoints: 90,
        color: "#10b981",
      },
    })
  ).id;

  await api("/api/v1/accounts", {
    method: "POST",
    body: { name: "Carteira", kind: "cash", openingBalance: 12000, openedOn: dia(7, 1), color: "#8f8f9c" },
  });

  const cartao = (
    await api("/api/v1/cards", {
      method: "POST",
      body: {
        name: "Nubank Roxinho",
        kind: "credit",
        paymentAccountId: conta,
        closingDay: 13,
        dueDay: 20,
        limit: 2500000,
        brand: "Mastercard",
        tier: "Ultravioleta",
        last4: "4417",
        color: "#7c5cff",
        isPrimary: true,
        rewardMode: "both",
        pointsPerDollarMilli: 1500,
        cashbackBasisPoints: 100,
        pointsGoal: 40000,
        manualUsdRateMicros: 5200000,
      },
    })
  ).id;

  await api("/api/v1/cards", {
    method: "POST",
    body: {
      name: "Caju",
      kind: "debit",
      paymentAccountId: va,
      closingDay: 1,
      dueDay: 5,
      limit: 0,
      brand: "Visa",
      last4: "8802",
      color: "#fb923c",
    },
  });

  console.log("2. Contas e cartões");

  // --- Recorrências --------------------------------------------------------
  await api("/api/v1/recurrences", {
    method: "POST",
    body: {
      role: "salary",
      kind: "income",
      description: "Salário",
      amount: 620000,
      scheduleMode: "business_day_of_month",
      scheduleDay: 5,
      accountId: conta,
      categoryId: idDe("Salário"),
      startsOn: dia(7, 1),
    },
  });

  await api("/api/v1/recurrences", {
    method: "POST",
    body: {
      role: "benefit",
      kind: "income",
      description: "Vale-alimentação",
      amount: 3800,
      amountMode: "per_business_day",
      scheduleDay: 5,
      accountId: va,
      categoryId: idDe("Salário"),
      startsOn: dia(7, 1),
    },
  });

  await api("/api/v1/recurrences", {
    method: "POST",
    body: {
      kind: "expense",
      description: "Aluguel",
      amount: 195000,
      scheduleDay: 10,
      accountId: conta,
      categoryId: idDe("Moradia"),
      startsOn: dia(7, 1),
    },
  });

  for (const assinatura of [
    { description: "Netflix", amount: 5590, scheduleDay: 12 },
    { description: "Spotify", amount: 2190, scheduleDay: 15 },
    { description: "Academia", amount: 12900, scheduleDay: 8 },
  ]) {
    await api("/api/v1/recurrences", {
      method: "POST",
      body: {
        role: "subscription",
        kind: "expense",
        ...assinatura,
        cardId: cartao,
        categoryId: idDe("Assinaturas"),
        startsOn: dia(7, 1),
      },
    });
  }

  console.log("3. Recorrências (salário, VA, aluguel, 3 assinaturas)");

  // --- Histórico -----------------------------------------------------------
  // Seis meses de movimento, com variação para os gráficos não ficarem retos.
  const mercados = [86500, 92300, 78900, 104200, 88700, 95100];
  const restaurantes = [12800, 9400, 18600, 7200, 14300, 11900];
  const transporte = [4590, 6720, 3810, 8940, 5230, 7150];

  for (let mes = 5; mes >= 0; mes -= 1) {
    const indice = 5 - mes;

    await api("/api/v1/transactions", {
      method: "POST",
      body: {
        kind: "income",
        description: "Salário",
        amount: 620000,
        occurredOn: dia(mes, 5),
        accountId: conta,
        categoryId: idDe("Salário"),
      },
    });

    await api("/api/v1/transactions", {
      method: "POST",
      body: {
        kind: "expense",
        description: "Aluguel",
        amount: 195000,
        occurredOn: dia(mes, 10),
        accountId: conta,
        categoryId: idDe("Moradia"),
      },
    });

    await api("/api/v1/transactions", {
      method: "POST",
      body: {
        kind: "expense",
        description: "Mercado do mês",
        amount: mercados[indice],
        occurredOn: dia(mes, 6),
        cardId: cartao,
        categoryId: idDe("Alimentação"),
      },
    });

    await api("/api/v1/transactions", {
      method: "POST",
      body: {
        kind: "expense",
        description: "Restaurante",
        amount: restaurantes[indice],
        occurredOn: dia(mes, 18),
        cardId: cartao,
        categoryId: idDe("Alimentação"),
      },
    });

    await api("/api/v1/transactions", {
      method: "POST",
      body: {
        kind: "expense",
        description: "Uber",
        amount: transporte[indice],
        occurredOn: dia(mes, 21),
        cardId: cartao,
        categoryId: idDe("Transporte"),
      },
    });

    // Guardar na reserva todo mês.
    await api("/api/v1/transactions", {
      method: "POST",
      body: {
        kind: "transfer",
        description: "Guardar na reserva",
        amount: 80000,
        occurredOn: dia(mes, 7),
        accountId: conta,
        destinationAccountId: reserva,
      },
    });
  }

  // Alguns gastos avulsos, para o relatório ter textura.
  const avulsos = [
    { d: dia(4, 22), desc: "Consulta dentista", v: 28000, cat: "Saúde" },
    { d: dia(3, 14), desc: "Curso de inglês", v: 45000, cat: "Educação" },
    { d: dia(2, 9), desc: "Ração e petshop", v: 21500, cat: "Pets" },
    { d: dia(2, 26), desc: "Cinema", v: 7800, cat: "Lazer" },
    { d: dia(1, 11), desc: "Farmácia", v: 13400, cat: "Saúde" },
    { d: dia(1, 24), desc: "Presente de aniversário", v: 19900, cat: "Compras" },
    { d: dia(0, 4), desc: "Livraria", v: 8900, cat: "Educação" },
  ];

  for (const item of avulsos) {
    await api("/api/v1/transactions", {
      method: "POST",
      body: {
        kind: "expense",
        description: item.desc,
        amount: item.v,
        occurredOn: item.d,
        cardId: cartao,
        categoryId: idDe(item.cat),
      },
    });
  }

  await api("/api/v1/transactions", {
    method: "POST",
    body: {
      kind: "income",
      description: "Projeto freelance",
      amount: 180000,
      occurredOn: dia(2, 19),
      accountId: conta,
      categoryId: idDe("Freelance"),
    },
  });

  console.log("4. Seis meses de histórico");

  // --- Parcelamentos -------------------------------------------------------
  await api("/api/v1/transactions", {
    method: "POST",
    body: {
      kind: "expense",
      description: "Notebook",
      amount: 540000,
      occurredOn: dia(4, 10),
      cardId: cartao,
      categoryId: idDe("Compras"),
      installmentCount: 10,
      monthlyInterestBasisPoints: 180,
    },
  });

  await api("/api/v1/transactions", {
    method: "POST",
    body: {
      kind: "expense",
      description: "Cadeira de escritório",
      amount: 189990,
      occurredOn: dia(1, 8),
      cardId: cartao,
      categoryId: idDe("Compras"),
      installmentCount: 6,
    },
  });

  console.log("5. Parcelamentos (notebook 10x com juros, cadeira 6x sem)");

  // --- Faturas pagas -------------------------------------------------------
  // As faturas são pagas a partir do que o servidor **diz** estar em aberto, e
  // não de uma lista de meses civis. A competência de uma compra no crédito não
  // é o mês em que ela aconteceu: num cartão que fecha dia 11, o que passou do
  // dia 11 já é da fatura seguinte. Adivinhar o mês deixava faturas com saldo
  // devedor sem pagamento e o cenário abria com tudo em atraso.
  // A lista é lida uma vez e percorrida da mais antiga para a mais nova. Pagar
  // uma fatura pode zerar o saldo devedor de outra, e a versão anterior parava
  // no primeiro "já quitada" — deixando meia dúzia de atrasos no cenário.
  const cartoes = await api("/api/v1/cards");
  const principal = cartoes.find((item) => item.id === cartao);
  const atrasadas = [...principal.overdueInvoices].sort((esquerda, direita) =>
    esquerda.competence.localeCompare(direita.competence),
  );

  // Deixa a última em atraso, junto com a fatura corrente: é o estado em que
  // alguém normalmente abre o aplicativo, e exercita os dois avisos sem pintar
  // a tela inteira de vermelho.
  let pagas = 0;
  for (const fatura of atrasadas.slice(0, Math.max(0, atrasadas.length - 1))) {
    try {
      await api("/api/v1/invoices/pay", {
        method: "POST",
        body: { cardId: cartao, competence: fatura.competence, accountId: conta, paidOn: fatura.dueDate },
      });
      pagas += 1;
    } catch (erro) {
      if (!String(erro).includes("já está quitada")) throw erro;
    }
  }
  const restantes = atrasadas.length - pagas;

  console.log(`6. ${pagas} faturas atrasadas pagas, ${restantes} deixada em atraso`);

  // --- Planejamento --------------------------------------------------------
  for (const [nome, teto] of [
    ["Alimentação", 130000],
    ["Transporte", 30000],
    ["Lazer", 40000],
    ["Compras", 60000],
  ]) {
    await api("/api/v1/budgets", { method: "POST", body: { categoryId: idDe(nome), amount: teto } });
  }

  await api("/api/v1/goals", {
    method: "POST",
    body: {
      name: "Viagem ao Japão",
      target: 1800000,
      monthlyContribution: 80000,
      targetDate: dia(-14, 30),
      accountId: reserva,
    },
  });

  await api("/api/v1/goals", {
    method: "POST",
    body: { name: "Trocar de carro", target: 4500000, monthlyContribution: 120000 },
  });

  await api("/api/v1/investments", {
    method: "POST",
    body: {
      name: "Tesouro Selic 2029",
      institution: "Nu Invest",
      assetClass: "fixed_income",
      liquidity: "daily",
      principal: 800000,
      currentValue: 872400,
    },
  });

  await api("/api/v1/investments", {
    method: "POST",
    body: {
      name: "IVVB11",
      institution: "XP",
      assetClass: "variable_income",
      liquidity: "daily",
      principal: 300000,
      currentValue: 341800,
    },
  });

  await api("/api/v1/investments", {
    method: "POST",
    body: {
      name: "CDB 118% CDI",
      institution: "Banco Inter",
      assetClass: "fixed_income",
      liquidity: "maturity",
      maturityDate: dia(-24, 15),
      principal: 500000,
      currentValue: 518900,
    },
  });

  console.log("7. Orçamentos, metas e investimentos");

  // --- Viagem --------------------------------------------------------------
  const viagem = await api("/api/v1/trips", {
    method: "POST",
    body: {
      name: "Chile",
      startDate: dia(3, 12),
      endDate: dia(3, 20),
      currency: "USD",
      exchangeRate: "5,42",
    },
  });

  // Uma viagem sem gastos etiquetados é uma tela vazia. A viagem é etiqueta
  // sobre lançamentos que já existem — então eles nascem aqui como lançamentos
  // normais, com `tripId`.
  const gastosDaViagem = [
    ["Passagem LATAM", 312000, 12, "Transporte"],
    ["Hotel em Santiago", 268400, 13, "Moradia"],
    ["Vale Nevado", 89500, 15, "Lazer"],
    ["Jantar no Bocanáriz", 47800, 16, "Alimentação"],
    ["Transfer aeroporto", 21300, 20, "Transporte"],
  ];

  for (const [descricao, valor, diaDoMes, categoria] of gastosDaViagem) {
    await api("/api/v1/transactions", {
      method: "POST",
      body: {
        kind: "expense",
        description: descricao,
        amount: valor,
        occurredOn: dia(3, diaDoMes),
        cardId: cartao,
        categoryId: idDe(categoria),
        tripId: viagem.id,
      },
    });
  }

  console.log("8. Viagem ao Chile com cinco gastos etiquetados");

  // --- Capturas por notificação --------------------------------------------
  // Sugestões pendentes de revisão, como o aplicativo Android produziria. O
  // texto é o de uma notificação real de banco: quem interpreta é o domínio.
  const agora = Date.now();
  await api("/api/v1/captures", {
    method: "POST",
    body: {
      notifications: [
        {
          sourceApp: "com.nu.production",
          title: "Nubank",
          text: "Compra aprovada: R$ 128,90 em PADARIA SANTO GRAO",
          postedAt: agora - 2 * 60 * 60 * 1000,
          deviceEventId: "demo-captura-1",
        },
        {
          sourceApp: "com.nu.production",
          title: "Nubank",
          text: "Compra aprovada: R$ 64,50 em POSTO IPIRANGA no débito",
          postedAt: agora - 26 * 60 * 60 * 1000,
          deviceEventId: "demo-captura-2",
        },
        {
          sourceApp: "com.picpay",
          title: "PicPay",
          text: "Você recebeu R$ 180,00 de Marina Alves",
          postedAt: agora - 50 * 60 * 60 * 1000,
          deviceEventId: "demo-captura-3",
        },
        {
          sourceApp: "com.itau",
          title: "Itaú",
          text: "Compra aprovada de R$ 2.499,00 em MAGAZINE LUIZA em 10x",
          postedAt: agora - 74 * 60 * 60 * 1000,
          deviceEventId: "demo-captura-4",
        },
      ],
    },
  });

  console.log("9. Quatro capturas de notificação aguardando revisão");

  // --- Importação em revisão -----------------------------------------------
  // Um extrato OFX pequeno, para a tela de importação abrir já na etapa de
  // revisão — que é a etapa que o produto precisa mostrar.
  const extrato = [
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:102",
    "",
    "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>",
    "<CURDEF>BRL",
    "<BANKTRANLIST>",
    linhaOfx("DEBIT", dia(0, 3), -21990, "ASSINATURA STREAMING", "demo-ofx-1"),
    linhaOfx("DEBIT", dia(0, 5), -14750, "FARMACIA PAGUE MENOS", "demo-ofx-2"),
    linhaOfx("DEBIT", dia(0, 6), -8900, "ESTACIONAMENTO CENTRO", "demo-ofx-3"),
    linhaOfx("CREDIT", dia(0, 7), 45000, "REEMBOLSO VIAGEM", "demo-ofx-4"),
    linhaOfx("DEBIT", dia(0, 9), -32640, "SUPERMERCADO ANGELONI", "demo-ofx-5"),
    "</BANKTRANLIST>",
    "</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>",
  ].join("\n");

  await api("/api/v1/imports", {
    method: "POST",
    body: {
      filename: "extrato-corrente.ofx",
      content: extrato,
      accountId: conta,
    },
  });

  console.log("10. Extrato OFX aguardando revisão");

  console.log("\nPronto. Entre com:\n");
  console.log(`  ${BASE}/entrar`);
  console.log(`  e-mail: ${EMAIL}`);
  console.log(`  senha:  ${SENHA}\n`);
}

main().catch((erro) => {
  console.error(`\nErro: ${erro.message}`);
  process.exit(1);
});
