/**
 * A curva de gastos do mês, no painel.
 *
 * O aplicativo desenhava esse traço a partir do razão local, pegando catorze
 * lançamentos em ordem arbitrária — e caindo para `[0, 0]`, uma reta, quando
 * havia menos de dois. Era um gráfico que não dizia nada e, no mês vazio,
 * parecia uma figura colada na tela.
 *
 * O que estes testes fixam é a propriedade que torna a curva confiável: **ela
 * termina no total que aparece escrito ao lado dela**. Se um dia alguém mudar
 * o filtro de um dos dois — as contas que entram, a situação, a natureza do
 * lançamento — o traço e o número passam a discordar, e é aqui que isso
 * aparece.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

/** Fim de setembro: a competência inteira já aconteceu. */
const FIM_DO_MES = new Date("2026-09-30T12:00:00Z");
/** Dia 12: metade do mês decorrida, o resto ainda por vir. */
const MEIO_DO_MES = new Date("2026-09-12T12:00:00Z");

describe("curva de gastos do painel", () => {
  beforeEach(() => zerar());

  it("acumula até o total de saídas do mês", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    for (const [dia, valor] of [
      ["2026-09-03", 12_000],
      ["2026-09-10", 25_000],
      ["2026-09-24", 8_000],
    ] as const) {
      await recordTransaction(
        alvo.userId,
        {
          kind: "expense",
          description: `Mercado ${dia}`,
          amount: cents(valor),
          occurredOn: localDate(dia),
          accountId: alvo.contaId,
          categoryId: alvo.categoriaId,
          state: "confirmed",
        },
        FIM_DO_MES,
      );
    }

    const painel = await buildDashboard(alvo.userId, FIM_DO_MES);
    const ultimo = painel.dailySpend.at(-1);

    assert.equal(painel.dailySpend.length, 30, "setembro tem trinta dias");
    assert.equal(ultimo?.date, "2026-09-30");
    assert.equal(ultimo?.accumulatedCents, painel.monthFlow.expenseCents);
    assert.equal(ultimo?.accumulatedCents, 45_000);
  });

  it("nunca desce: é acumulado, não gasto do dia", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    await recordTransaction(
      alvo.userId,
      {
        kind: "expense",
        description: "Compra grande",
        amount: cents(30_000),
        occurredOn: localDate("2026-09-05"),
        accountId: alvo.contaId,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      FIM_DO_MES,
    );

    const painel = await buildDashboard(alvo.userId, FIM_DO_MES);

    let anterior = 0;
    for (const ponto of painel.dailySpend) {
      assert.ok(
        ponto.accumulatedCents >= anterior,
        `o ponto de ${ponto.date} desceu de ${anterior} para ${ponto.accumulatedCents}`,
      );
      anterior = ponto.accumulatedCents;
    }
  });

  it("para em hoje, e não no fim do mês", async () => {
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    const painel = await buildDashboard(alvo.userId, MEIO_DO_MES);

    assert.equal(painel.dailySpend.length, 12);
    assert.equal(painel.dailySpend[0]?.date, "2026-09-01");
    assert.equal(painel.dailySpend.at(-1)?.date, "2026-09-12");
  });

  it("existe mesmo no mês sem nenhum gasto, com um ponto por dia decorrido", async () => {
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    const painel = await buildDashboard(alvo.userId, MEIO_DO_MES);

    // Doze zeros, e não uma lista vazia: a tela precisa de eixo para desenhar
    // a linha de base. Era o caso em que o aplicativo inventava `[0, 0]`.
    assert.equal(painel.dailySpend.length, 12);
    assert.ok(painel.dailySpend.every((ponto) => ponto.accumulatedCents === 0));
  });

  it("deixa de fora o que o total do mês também deixa", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    // No cartão: entra na fatura, não nas saídas do mês em conta corrente.
    await recordTransaction(
      alvo.userId,
      {
        kind: "expense",
        description: "Compra no cartão",
        amount: cents(40_000),
        occurredOn: localDate("2026-09-04"),
        cardId: alvo.cartaoId,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      FIM_DO_MES,
    );

    // Prevista, ainda não aconteceu.
    await recordTransaction(
      alvo.userId,
      {
        kind: "expense",
        description: "Conta de luz",
        amount: cents(15_000),
        occurredOn: localDate("2026-09-28"),
        accountId: alvo.contaId,
        categoryId: alvo.categoriaId,
        state: "planned",
      },
      FIM_DO_MES,
    );

    const painel = await buildDashboard(alvo.userId, FIM_DO_MES);

    assert.equal(painel.dailySpend.at(-1)?.accumulatedCents, painel.monthFlow.expenseCents);
    assert.equal(painel.dailySpend.at(-1)?.accumulatedCents, 0);
  });
});
