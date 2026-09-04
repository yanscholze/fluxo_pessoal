/**
 * Parcelamento: dividir, projetar, antecipar.
 *
 * A compra parcelada é o lançamento mais delicado do Fluxo: um fato do usuário
 * vira N lançamentos, cada um numa competência, cada um numa fatura, e a soma
 * das parcelas precisa dar exatamente o valor da compra. Um centavo perdido no
 * arredondamento não aparece em nenhuma tela — aparece meses depois, como uma
 * fatura que não fecha.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-08-20T12:00:00Z");

async function comprarParcelado(
  userId: string,
  cartaoId: string,
  categoriaId: string,
  valor: number,
  parcelas: number,
  jurosBasisPoints = 0,
) {
  const { recordTransaction } = await import("./transactions.ts");
  return recordTransaction(
    userId,
    {
      kind: "expense",
      description: "Notebook",
      amount: cents(valor),
      occurredOn: localDate("2026-08-05"),
      cardId: cartaoId,
      categoryId: categoriaId,
      state: "confirmed",
      installmentCount: parcelas,
      monthlyInterestBasisPoints: jurosBasisPoints,
    },
    AGORA,
  );
}

describe("compra parcelada", () => {
  beforeEach(() => zerar());

  it("a soma das parcelas é exatamente o valor da compra", async () => {
    const alvo = await ambiente();
    // 100,00 em 3 não divide: o resto tem de ser distribuído, não descartado.
    const compra = await comprarParcelado(alvo.userId, alvo.cartaoId, alvo.categoriaId, 10_000, 3);

    const { buildInstallmentsView } = await import("./installments.ts");
    const view = await buildInstallmentsView(alvo.userId, AGORA);
    const plano = view.active.find((item) => item.planId === compra.installmentPlanId);

    assert.ok(plano, "o plano precisa aparecer entre os ativos");
    assert.equal(plano.totalAmount, 10_000);
    assert.equal(
      plano.entries.reduce((soma, parcela) => soma + parcela.amountCents, 0),
      10_000,
      "a soma das parcelas não pode perder nem ganhar centavo",
    );
    assert.equal(compra.ids.length, 3, "uma transação por parcela");
  });

  it("cada parcela cai numa competência consecutiva", async () => {
    const alvo = await ambiente();
    await comprarParcelado(alvo.userId, alvo.cartaoId, alvo.categoriaId, 30_000, 3);

    const { buildInstallmentsView } = await import("./installments.ts");
    const view = await buildInstallmentsView(alvo.userId, AGORA);
    const plano = view.active[0];

    assert.deepEqual(
      plano?.entries.map((parcela) => parcela.competence),
      ["2026-08", "2026-09", "2026-10"],
      "compra de 05/08 num cartão que fecha dia 13 começa na fatura de agosto",
    );
  });

  it("só a primeira parcela é fato; as seguintes são compromisso", async () => {
    const alvo = await ambiente();
    await comprarParcelado(alvo.userId, alvo.cartaoId, alvo.categoriaId, 30_000, 3);

    const { listTransactions } = await import("../repositories/ledger.ts");
    const parcelas = (await listTransactions(alvo.userId, { limit: 100 }))
      .filter((item) => item.installmentNumber !== null)
      .sort((esquerda, direita) => (esquerda.installmentNumber ?? 0) - (direita.installmentNumber ?? 0));

    assert.equal(parcelas[0]?.state, "confirmed");
    assert.equal(parcelas[1]?.state, "planned");
    assert.equal(parcelas[2]?.state, "planned");
  });

  it("a compra parcelada ocupa limite inteiro, não só a primeira parcela", async () => {
    const alvo = await ambiente();
    await comprarParcelado(alvo.userId, alvo.cartaoId, alvo.categoriaId, 30_000, 3);

    const { buildCardsView } = await import("./cards.ts");
    const view = await buildCardsView(alvo.userId, AGORA);
    const cartao = view.cards.find((card) => card.id === alvo.cartaoId);

    // Limite de 10.000,00 menos os 300,00 comprometidos nas três parcelas.
    assert.equal(cartao?.availableLimitCents, 970_000);
  });

  it("antecipar compra sem juros não inventa desconto", async () => {
    const alvo = await ambiente();
    const compra = await comprarParcelado(alvo.userId, alvo.cartaoId, alvo.categoriaId, 30_000, 3);

    const { simulatePlanAnticipation } = await import("./installments.ts");
    const { scenarios } = await simulatePlanAnticipation(
      alvo.userId,
      compra.installmentPlanId as string,
      AGORA,
    );

    assert.ok(scenarios.length > 0, "precisa haver cenário para parcelas em aberto");
    for (const cenario of scenarios) {
      assert.equal(cenario.savingsCents, 0, "sem juros embutidos não há o que economizar");
      assert.equal(cenario.dueTodayCents, cenario.nominalCents);
    }
  });

  it("antecipar compra com juros desconta o valor presente", async () => {
    const alvo = await ambiente();
    const compra = await comprarParcelado(alvo.userId, alvo.cartaoId, alvo.categoriaId, 30_000, 3, 200);

    const { simulatePlanAnticipation } = await import("./installments.ts");
    const { scenarios } = await simulatePlanAnticipation(
      alvo.userId,
      compra.installmentPlanId as string,
      AGORA,
    );

    const maisDeUma = scenarios.find((cenario) => cenario.count >= 2);
    assert.ok(maisDeUma, "precisa existir cenário com duas parcelas ou mais");
    assert.ok(maisDeUma.savingsCents > 0, "com 2% ao mês antecipar precisa economizar");
    assert.ok(
      maisDeUma.dueTodayCents < maisDeUma.nominalCents,
      "o valor de hoje é menor que a soma nominal",
    );
  });

  it("antecipar encurta o compromisso", async () => {
    const alvo = await ambiente();
    const compra = await comprarParcelado(alvo.userId, alvo.cartaoId, alvo.categoriaId, 60_000, 6);

    const { simulatePlanAnticipation } = await import("./installments.ts");
    const { scenarios } = await simulatePlanAnticipation(
      alvo.userId,
      compra.installmentPlanId as string,
      AGORA,
    );

    const duas = scenarios.find((cenario) => cenario.count === 2);
    assert.equal(duas?.monthsShortened, 2, "antecipar as duas últimas encurta dois meses");
  });

  it("não existe cenário para um plano que não é do usuário", async () => {
    const alvo = await ambiente();
    const { simulatePlanAnticipation } = await import("./installments.ts");

    await assert.rejects(
      () => simulatePlanAnticipation(alvo.userId, "plano-que-nao-existe", AGORA),
      /Parcelamento/,
    );
  });
});
