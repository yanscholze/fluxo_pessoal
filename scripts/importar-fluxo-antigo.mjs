/**
 * Importa o export da primeira implementação do Fluxo.
 *
 * Fala com a API de verdade, pelos mesmos caminhos da interface — nada de
 * `INSERT` direto. Escrever no banco à mão produziria estados que a aplicação
 * nunca alcançaria: fatura sem ciclo, parcela sem plano, saldo que não deriva
 * do razão. Aqui cada linha passa pela mesma validação e pelo mesmo domínio
 * que o uso normal.
 *
 * Uso:
 *   node scripts/importar-fluxo-antigo.mjs <export.json> [--url URL] [--aplicar]
 *
 * Sem `--aplicar` ele **simula**: lê tudo, resolve as referências, relata o que
 * faria e não escreve nada. É o modo padrão de propósito — a importação mexe
 * em dinheiro de verdade, e a conferência tem de vir antes.
 *
 * Credenciais vêm do ambiente (`FLUXO_EMAIL`, `FLUXO_SENHA`), nunca de
 * argumento: linha de comando vaza em histórico de shell e em lista de
 * processos.
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith("--"));
const aplicar = args.includes("--aplicar");
const base = (args[args.indexOf("--url") + 1] ?? "").startsWith("http")
  ? args[args.indexOf("--url") + 1]
  : "http://localhost:5173";

if (!arquivo) {
  console.error("uso: node scripts/importar-fluxo-antigo.mjs <export.json> [--url URL] [--aplicar]");
  process.exit(64);
}

const EMAIL = process.env.FLUXO_EMAIL;
const SENHA = process.env.FLUXO_SENHA;

if (!EMAIL || !SENHA) {
  console.error("defina FLUXO_EMAIL e FLUXO_SENHA no ambiente");
  process.exit(64);
}

let cookie = "";
const problemas = [];

async function api(caminho, { method = "GET", body } = {}) {
  const resposta = await fetch(`${base}${caminho}`, {
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

/** Reais decimais viram a string que a API espera, sem passar por float. */
function dinheiro(valor) {
  return (Math.round(Number(valor) * 100) / 100).toFixed(2).replace(".", ",");
}

/**
 * Tipos de conta.
 *
 * Os cinco do produto antigo existem no novo com o mesmo nome. `cash` cobre o
 * dinheiro em espécie, e `benefit` o vale — que não é conta corrente porque
 * não se transfere de lá para qualquer lugar.
 */
const TIPO_DE_CONTA = {
  checking: "checking",
  savings: "savings",
  cash: "cash",
  benefit: "benefit",
  investment: "investment",
};

/**
 * Categorias que existiam só para nomear movimento entre contas.
 *
 * No modelo novo, transferência e pagamento de fatura **não têm categoria**:
 * eles não são consumo, são dinheiro mudando de lugar. Criá-las de volta faria
 * o relatório de despesas contar como gasto o que só trocou de bolso.
 */
const CATEGORIAS_DESCARTADAS = new Set(["Transferência", "Pagamento de fatura", "Pagamento Fatura"]);

/**
 * A conta que o produto antigo usava para projetar pagamento de fatura.
 *
 * Ela recebia "Pagamento Fatura Futura" para o saldo previsto fechar. O modelo
 * novo projeta a fatura sozinho a partir do ciclo do cartão, então esse
 * artifício deixou de ser necessário — mas a conta é importada mesmo assim,
 * fora dos totais, para nenhum lançamento histórico ficar sem destino.
 */
const CONTA_ARTIFICIAL = "Lançamento Futuro Para Fatura";

async function main() {
  const dados = JSON.parse(readFileSync(arquivo, "utf8"));

  console.log(`\nExport de ${dados.exportedAt} — ${dados.user?.email ?? "sem usuário"}`);
  console.log(
    `  ${dados.accounts.length} contas · ${dados.cards.length} cartões · ` +
      `${dados.categories.length} categorias · ${dados.transactions.length} lançamentos`,
  );
  console.log(aplicar ? "\nMODO: aplicando\n" : "\nMODO: simulação (use --aplicar para escrever)\n");

  await api("/api/v1/session", {
    method: "POST",
    body: { action: "signin", email: EMAIL, password: SENHA },
  });

  // -------------------------------------------------------------------------
  // Catálogo
  // -------------------------------------------------------------------------

  const contaPorNome = new Map();
  const categoriaPorNome = new Map();
  const cartaoPorNome = new Map();
  const cartaoPorIdAntigo = new Map();

  // O que já existe na conta é reaproveitado: rodar duas vezes não duplica
  // catálogo, e uma conta recém-criada já vem com categorias padrão.
  if (aplicar) {
    for (const conta of (await api("/api/v1/accounts")) ?? []) contaPorNome.set(conta.name, conta.id);
    for (const categoria of (await api("/api/v1/categories")) ?? []) {
      categoriaPorNome.set(categoria.name, categoria.id);
    }
    for (const cartao of (await api("/api/v1/cards")) ?? []) cartaoPorNome.set(cartao.name, cartao.id);
  }

  /*
   * A abertura é o saldo de hoje **menos** o que os lançamentos vão movimentar.
   *
   * O export traz o saldo atual, não o inicial. Usá-lo como abertura e ainda
   * lançar os 396 movimentos por cima contaria a mesma vida duas vezes: o
   * saldo final sairia com o dobro do movimento do período. Descontando o
   * efeito líquido do que será importado, o razão reconstrói exatamente o
   * saldo que o usuário vê hoje no produto antigo — e o histórico anterior ao
   * export fica embutido na abertura, que é o que ele é.
   *
   * Só o que **já aconteceu** entra na conta. O export vai até 2027 — parcelas
   * a vencer e contas planejadas — e o saldo que ele informa não as viu ainda.
   * Descontá-las derrubava a abertura em dez mil reais, e o pagamento de fatura
   * de janeiro batia em "saldo insuficiente" numa conta que nunca esteve no
   * vermelho.
   */
  const dataDoExport = (dados.exportedAt ?? "").slice(0, 10);
  const jaAconteceu = (t) => t.status !== "planned" && (!dataDoExport || t.date <= dataDoExport);
  const efeitoNaConta = new Map();
  const somar = (nome, centavos) => {
    if (!nome) return;
    efeitoNaConta.set(nome, (efeitoNaConta.get(nome) ?? 0) + centavos);
  };

  for (const t of dados.transactions) {
    if (!jaAconteceu(t)) continue;

    const centavos = Math.round(Number(t.amount) * 100);
    // Compra no crédito não move a conta: move a fatura, e o pagamento dela é
    // que sai do saldo — e o pagamento é um lançamento próprio no export.
    const noCartao = t.paymentMethod === "credit" && t.cardId;

    if (t.type === "transfer") {
      somar(t.account, -centavos);
      somar(t.destinationAccount, centavos);
    } else if (t.type === "income") {
      somar(t.account, centavos);
    } else if (!noCartao) {
      somar(t.account, -centavos);
    }
  }

  /*
   * Quanto cada conta ficaria negativa no caminho.
   *
   * O export não traz o salário como lançamento — ele vivia na regra de
   * recorrência, com um "último mês confirmado" — então vinte meses de receita
   * mensal faltam no histórico enquanto as despesas estão todas lá. A
   * reconstrução afunda no meio do caminho, e o pagamento de fatura, que exige
   * saldo na data, é recusado por dinheiro que existiu de verdade.
   *
   * A saída é dar à conta a abertura que ela precisava ter e registrar a
   * diferença como um ajuste explícito, na data do export. Escondê-la faria o
   * saldo final mentir; deixá-la de fora faria o histórico não fechar.
   */
  const deficitDaConta = new Map();
  for (const conta of dados.accounts) {
    const movimentos = dados.transactions
      .filter((t) => jaAconteceu(t))
      .filter((t) => {
        const noCartao = t.paymentMethod === "credit" && t.cardId;
        return (t.account === conta.name && !noCartao) || t.destinationAccount === conta.name;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    let saldo = Math.round(Number(conta.balance ?? 0) * 100) - (efeitoNaConta.get(conta.name) ?? 0);
    let menor = saldo;

    for (const t of movimentos) {
      const centavos = Math.round(Number(t.amount) * 100);
      saldo +=
        t.destinationAccount === conta.name ? centavos : t.type === "income" ? centavos : -centavos;
      if (saldo < menor) menor = saldo;
    }

    if (menor < 0) deficitDaConta.set(conta.name, -menor);
  }

  for (const conta of dados.accounts) {
    if (contaPorNome.has(conta.name)) continue;
    const atual = Math.round(Number(conta.balance ?? 0) * 100);
    const deficit = deficitDaConta.get(conta.name) ?? 0;
    const abertura = (atual - (efeitoNaConta.get(conta.name) ?? 0) + deficit) / 100;

    const payload = {
      name: conta.name,
      kind: TIPO_DE_CONTA[conta.kind] ?? "checking",
      institution: conta.institution || null,
      currency: conta.currency || "BRL",
      openingBalance: dinheiro(abertura),
      ...(conta.goal ? { goalAmount: dinheiro(conta.goal) } : {}),
      includeInTotals: conta.name !== CONTA_ARTIFICIAL,
    };
    if (aplicar) contaPorNome.set(conta.name, (await api("/api/v1/accounts", { method: "POST", body: payload })).id);
    else contaPorNome.set(conta.name, `simulada:${conta.name}`);
  }

  for (const categoria of dados.categories) {
    const nome = typeof categoria === "string" ? categoria : categoria.name;
    const tipo = typeof categoria === "string" ? "expense" : (categoria.type ?? categoria.kind ?? "expense");
    if (CATEGORIAS_DESCARTADAS.has(nome) || categoriaPorNome.has(nome)) continue;

    if (aplicar) {
      categoriaPorNome.set(
        nome,
        (await api("/api/v1/categories", { method: "POST", body: { name: nome, kind: tipo } })).id,
      );
    } else categoriaPorNome.set(nome, `simulada:${nome}`);
  }

  for (const cartao of dados.cards) {
    const contaId = contaPorNome.get(cartao.linkedAccount);
    if (!contaId) {
      problemas.push(`cartão "${cartao.name}": conta "${cartao.linkedAccount}" não existe no export`);
      continue;
    }

    if (!cartaoPorNome.has(cartao.name)) {
      const payload = {
        name: cartao.name,
        kind: cartao.kind === "credit" ? "credit" : "debit",
        paymentAccountId: contaId,
        closingDay: cartao.closingDay || 1,
        dueDay: cartao.dueDay || 10,
        dueAdjustment: cartao.dueAdjustment === "previous" ? "previous" : "next",
        limit: cartao.limit ? dinheiro(cartao.limit) : null,
        brand: cartao.brand || null,
        tier: cartao.tier || null,
        last4: cartao.last4 || null,
        rewardMode: ["none", "points", "cashback", "both"].includes(cartao.rewardMode)
          ? cartao.rewardMode
          : "none",
        ...(cartao.pointsPerDollar
          ? { pointsPerDollarMilli: Math.round(cartao.pointsPerDollar * 1000) }
          : {}),
        ...(cartao.cashbackPercent
          ? { cashbackBasisPoints: Math.round(cartao.cashbackPercent * 100) }
          : {}),
        ...(cartao.pointsGoal ? { pointsGoal: Math.round(cartao.pointsGoal) } : {}),
      };
      if (aplicar) {
        cartaoPorNome.set(cartao.name, (await api("/api/v1/cards", { method: "POST", body: payload })).id);
      } else cartaoPorNome.set(cartao.name, `simulado:${cartao.name}`);
    }
    cartaoPorIdAntigo.set(cartao.id, cartaoPorNome.get(cartao.name));
  }

  console.log(
    `catálogo: ${contaPorNome.size} contas · ${categoriaPorNome.size} categorias · ${cartaoPorNome.size} cartões`,
  );

  // -------------------------------------------------------------------------
  // Lançamentos
  // -------------------------------------------------------------------------

  const contagem = {
    simples: 0,
    parcelados: 0,
    transferencias: 0,
    faturas: 0,
    /** Pagou o que a fatura de cá tinha, não o valor histórico. */
    faturasAjustadas: 0,
    /** A fatura já estava quitada por outro pagamento do mesmo mês. */
    faturasQuitadas: 0,
    /** Lançamentos que devolvem o que a abertura ganhou. */
    ajustes: 0,
    pulados: 0,
  };

  const ehPagamentoDeFatura = (t) =>
    t.type === "transfer" && !t.destinationAccount && /fatura/i.test(t.category ?? t.description ?? "");

  /**
   * O valor da compra que originou o parcelamento.
   *
   * Com todas as parcelas presentes é a soma delas, e o domínio divide de volta
   * sem centavo perdido. Faltando parcelas — o export tem grupos que só
   * registram as vencidas — somar o que está lá subestimaria a compra: quatro
   * de doze parcelas de R$ 265,93 viraram uma compra de R$ 1.063,74 dividida em
   * doze, ou R$ 88,64 por mês, um terço do valor real. Aí a conta é pelo valor
   * da parcela.
   */
  const valorDaCompra = (parcelas, total) => {
    const soma = parcelas.reduce((acumulado, p) => acumulado + Number(p.amount), 0);
    if (parcelas.length >= total) return soma;
    return (soma / parcelas.length) * total;
  };

  // Uma parcela só entra pelo plano, e o plano nasce da primeira: recriar cada
  // parcela como lançamento solto perderia o vínculo que faz a antecipação e o
  // comprometimento futuro existirem.
  const grupos = new Map();
  for (const t of dados.transactions) {
    if (!t.installmentGroupId) continue;
    const atual = grupos.get(t.installmentGroupId) ?? [];
    atual.push(t);
    grupos.set(t.installmentGroupId, atual);
  }

  const ordenadas = [...dados.transactions].sort((a, b) => a.date.localeCompare(b.date));
  const gruposFeitos = new Set();

  for (const t of ordenadas) {
    try {
      if (t.installmentGroupId) {
        if (gruposFeitos.has(t.installmentGroupId)) continue;
        gruposFeitos.add(t.installmentGroupId);

        const parcelas = grupos.get(t.installmentGroupId).sort((a, b) => a.date.localeCompare(b.date));
        const primeira = parcelas[0];
        const total = Number(primeira.installments?.split("/")?.[1] ?? parcelas.length);
        const cardId = cartaoPorIdAntigo.get(primeira.cardId);
        if (!cardId) {
          problemas.push(`parcelamento "${primeira.description}": cartão não resolvido`);
          contagem.pulados += parcelas.length;
          continue;
        }

        if (aplicar) {
          await api("/api/v1/transactions", {
            method: "POST",
            body: {
              kind: "expense",
              description: primeira.description,
              amount: dinheiro(valorDaCompra(parcelas, total)),
              occurredOn: primeira.date,
              cardId,
              categoryId: categoriaPorNome.get(primeira.category) ?? null,
              installmentCount: total,
            },
          });
        }
        contagem.parcelados += 1;
        continue;
      }

      if (ehPagamentoDeFatura(t)) {
        // Pagamento de fatura tem rota própria: ele quita a competência e move
        // o dinheiro, coisas que um lançamento comum não faz.
        const nomeDoCartao = dados.cards.find((c) => t.description?.includes(c.name))?.name;
        const cardId = nomeDoCartao ? cartaoPorNome.get(nomeDoCartao) : null;
        const accountId = contaPorNome.get(t.account);

        if (!cardId || !accountId) {
          problemas.push(`pagamento de fatura "${t.description}" (${t.date}): cartão ou conta não resolvidos`);
          contagem.pulados += 1;
          continue;
        }

        /*
         * A competência vem do próprio lançamento, não da data do pagamento.
         *
         * O export diz qual fatura cada pagamento quitou. Deduzir pelo mês em
         * que o dinheiro saiu erra sempre que o vencimento cai no mês seguinte
         * ao fechamento — que é o caso normal de um cartão.
         */
        const competencia = t.invoiceMonth ?? t.date.slice(0, 7);

        if (aplicar) {
          /*
           * Tenta o valor histórico; se não couber, paga o que a fatura tem.
           *
           * Os dois produtos atribuem competência por regras próprias, então
           * uma compra do dia 20 pode cair em faturas diferentes em cada um, e
           * o pagamento histórico às vezes cobre mais do que a fatura de cá
           * comporta. Consultar antes exigiria uma rota de fatura passada que a
           * API não oferece; tentar e cair para o total em aberto chega ao
           * mesmo lugar, com uma chamada a mais só quando diverge.
           */
          const corpoDoPagamento = { cardId, competence: competencia, accountId, paidOn: t.date };

          try {
            await api("/api/v1/invoices/pay", {
              method: "POST",
              body: { ...corpoDoPagamento, amount: dinheiro(t.amount) },
            });
            contagem.faturas += 1;
          } catch (erro) {
            if (!/maior que o restante|já está quitada|Saldo insuficiente/i.test(erro.message)) throw erro;

            // Sem `amount`, o serviço quita o que estiver em aberto.
            try {
              await api("/api/v1/invoices/pay", { method: "POST", body: corpoDoPagamento });
              contagem.faturas += 1;
              contagem.faturasAjustadas += 1;
            } catch (segundoErro) {
              if (!/já está quitada|nada em aberto/i.test(segundoErro.message)) throw segundoErro;
              contagem.faturasQuitadas += 1;
            }
          }
        } else {
          contagem.faturas += 1;
        }
        continue;
      }


      const corpo = {
        kind: t.type === "transfer" ? "transfer" : t.type,
        description: t.description,
        amount: dinheiro(t.amount),
        occurredOn: t.date,
        state: t.status === "planned" ? "planned" : "confirmed",
        categoryId: categoriaPorNome.get(t.category) ?? null,
      };

      if (t.type === "transfer") {
        corpo.accountId = contaPorNome.get(t.account);
        corpo.destinationAccountId = contaPorNome.get(t.destinationAccount);
        if (!corpo.accountId || !corpo.destinationAccountId) {
          problemas.push(`transferência "${t.description}" (${t.date}): conta de origem ou destino não resolvida`);
          contagem.pulados += 1;
          continue;
        }
        contagem.transferencias += 1;
      } else if (t.paymentMethod === "credit" && t.cardId) {
        corpo.cardId = cartaoPorIdAntigo.get(t.cardId);
        if (!corpo.cardId) {
          problemas.push(`lançamento "${t.description}" (${t.date}): cartão não resolvido`);
          contagem.pulados += 1;
          continue;
        }
        contagem.simples += 1;
      } else {
        corpo.accountId = contaPorNome.get(t.account);
        if (!corpo.accountId) {
          problemas.push(`lançamento "${t.description}" (${t.date}): conta "${t.account}" não resolvida`);
          contagem.pulados += 1;
          continue;
        }
        contagem.simples += 1;
      }

      if (aplicar) await api("/api/v1/transactions", { method: "POST", body: corpo });
    } catch (erro) {
      problemas.push(`"${t.description}" (${t.date}): ${erro.message}`);
      contagem.pulados += 1;
    }
  }

  // -------------------------------------------------------------------------
  // Recorrências
  // -------------------------------------------------------------------------

  /*
   * Devolve o que a abertura ganhou para o histórico fechar.
   *
   * Sem isto, a conta terminaria com o déficit sobrando — um dinheiro que o
   * export não tem. O lançamento fica visível, com data e descrição, porque
   * uma correção de importação que ninguém vê é indistinguível de um erro.
   */
  for (const [nome, deficit] of deficitDaConta) {
    const accountId = contaPorNome.get(nome);
    if (!accountId || !deficit) continue;

    if (aplicar) {
      await api("/api/v1/transactions", {
        method: "POST",
        body: {
          kind: "expense",
          description: "Ajuste de importação · histórico anterior ao export",
          amount: dinheiro(deficit / 100),
          occurredOn: dataDoExport,
          accountId,
          state: "confirmed",
        },
      });
    }
    contagem.ajustes += 1;
  }

  const recorrencias = [
    ...(dados.salaryRule ? [{ ...dados.salaryRule, role: "salary" }] : []),
    ...(dados.benefitRule ? [{ ...dados.benefitRule, role: "benefit" }] : []),
    ...(dados.recurringRules ?? []).map((r) => ({ ...r, role: "standard" })),
  ];

  let feitas = 0;
  for (const regra of recorrencias) {
    const accountId = contaPorNome.get(regra.account);
    if (!accountId) {
      problemas.push(`recorrência "${regra.description}": conta "${regra.account}" não resolvida`);
      continue;
    }

    const corpo = {
      role: regra.role,
      kind: regra.type === "income" ? "income" : "expense",
      description: regra.description,
      amount: dinheiro(regra.amount),
      // `per_business_day` é como o vale-alimentação funciona: valor por dia
      // útil, não valor fixo do mês.
      amountMode: regra.calculationMode === "perBusinessDay" ? "per_business_day" : "fixed",
      scheduleDay: Math.min(Math.max(Number(regra.dayOfMonth) || 1, 1), 31),
      accountId,
      categoryId: categoriaPorNome.get(regra.category) ?? null,
    };

    try {
      if (aplicar) await api("/api/v1/recurrences", { method: "POST", body: corpo });
      feitas += 1;
    } catch (erro) {
      problemas.push(`recorrência "${regra.description}": ${erro.message}`);
    }
  }

  // -------------------------------------------------------------------------
  // Relatório
  // -------------------------------------------------------------------------

  console.log(`\nlançamentos:`);
  console.log(`  ${contagem.simples} avulsos`);
  console.log(`  ${contagem.parcelados} parcelamentos (${grupos.size} grupos no export)`);
  console.log(`  ${contagem.transferencias} transferências`);
  console.log(
    `  ${contagem.faturas} pagamentos de fatura` +
      (contagem.faturasAjustadas ? ` (${contagem.faturasAjustadas} com valor ajustado à fatura de cá)` : "") +
      (contagem.faturasQuitadas ? ` · ${contagem.faturasQuitadas} já quitadas` : ""),
  );
  console.log(`  ${contagem.pulados} não importados`);
  if (contagem.ajustes) {
    console.log(
      `  ${contagem.ajustes} ajuste(s) de importação (histórico de receita que o export não traz)`,
    );
  }
  console.log(`recorrências: ${feitas}`);

  /*
   * Conferência: o saldo de cada conta tem de bater com o do export.
   *
   * É o único número que o usuário consegue verificar de cabeça, e o que
   * denuncia qualquer erro de sinal, de duplicação ou de conversão — um
   * lançamento importado ao contrário aparece aqui como o dobro do valor de
   * diferença, não como um erro silencioso.
   */
  if (aplicar) {
    console.log("\nconferência de saldos:");
    const contas = (await api("/api/v1/accounts")) ?? [];
    let divergentes = 0;

    for (const original of dados.accounts) {
      const importada = contas.find((c) => c.name === original.name);
      if (!importada) {
        console.log(`  ✗ ${original.name}: não encontrada`);
        divergentes += 1;
        continue;
      }

      const esperado = Math.round(Number(original.balance ?? 0) * 100);
      const obtido = importada.balanceCents ?? 0;
      const diferenca = obtido - esperado;

      if (diferenca === 0) {
        console.log(`  ✓ ${original.name}: R$ ${(obtido / 100).toFixed(2)}`);
      } else {
        divergentes += 1;
        console.log(
          `  ✗ ${original.name}: esperado R$ ${(esperado / 100).toFixed(2)}, ` +
            `obtido R$ ${(obtido / 100).toFixed(2)} (diferença R$ ${(diferenca / 100).toFixed(2)})`,
        );
      }
    }

    console.log(divergentes ? `  → ${divergentes} conta(s) fora do esperado` : "  → todas conferem");
  }

  if (problemas.length) {
    console.log(`\n${problemas.length} problema(s):`);
    for (const p of problemas.slice(0, 25)) console.log(`  · ${p}`);
    if (problemas.length > 25) console.log(`  … e mais ${problemas.length - 25}`);
  } else {
    console.log("\nnenhum problema.");
  }

  if (!aplicar) console.log("\nNada foi escrito. Rode com --aplicar quando os números acima fizerem sentido.");
}

main().catch((erro) => {
  console.error(`\nErro: ${erro.message}`);
  process.exit(1);
});
