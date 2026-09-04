/**
 * Assinaturas, contra o banco.
 *
 * O que precisa ficar provado aqui é o que a tela promete e ninguém confere: a
 * anual entra no mês como um doze avos, a pausada não soma, e a classificação
 * divide o bolo. Esses três números são a razão da aba existir — se algum
 * estiver errado, o usuário decide cancelar a assinatura errada.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-09-10T12:00:00Z");

describe("assinaturas", () => {
  beforeEach(() => {
    zerar();
  });

  it("a anual entra no mês como um doze avos, e no ano pelo valor cheio", async () => {
    const { userId, cartaoId } = await ambiente();
    const { createSubscription, buildSubscriptionsReport } = await import("./subscriptions.ts");

    await createSubscription(
      userId,
      {
        description: "Anuidade do cartão",
        amount: cents(120_000),
        scheduleDay: 5,
        interval: "yearly",
        cardId: cartaoId,
      },
      AGORA,
    );

    const relatorio = await buildSubscriptionsReport(userId, AGORA);

    assert.equal(relatorio.totals.monthlyCents, 10_000, "R$ 1.200 por ano são R$ 100 por mês");
    assert.equal(relatorio.totals.yearlyCents, 120_000);
  });

  it("assinatura pausada não soma no mês", async () => {
    const { userId, cartaoId } = await ambiente();
    const { createSubscription, buildSubscriptionsReport } = await import("./subscriptions.ts");
    const { setRecurrenceActive } = await import("./recurrences.ts");

    const ativa = await createSubscription(
      userId,
      { description: "Netflix", amount: cents(5_590), scheduleDay: 12, cardId: cartaoId },
      AGORA,
    );
    const pausada = await createSubscription(
      userId,
      { description: "Disney+", amount: cents(4_390), scheduleDay: 20, cardId: cartaoId },
      AGORA,
    );
    await setRecurrenceActive(userId, pausada, false);

    const relatorio = await buildSubscriptionsReport(userId, AGORA);

    assert.equal(relatorio.totals.monthlyCents, 5_590);
    assert.equal(relatorio.totals.activeCount, 1);
    assert.equal(relatorio.totals.pausedCount, 1);
    assert.equal(relatorio.subscriptions.find((linha) => linha.id === ativa)?.isActive, true);
  });

  it("a classificação divide o total, e o que não tem classificação continua contado", async () => {
    const { userId, cartaoId } = await ambiente();
    const { createSubscription, buildSubscriptionsReport, ensureLabels } = await import(
      "./subscriptions.ts"
    );

    const rotulos = await ensureLabels(userId, AGORA);
    const streaming = rotulos.find((rotulo) => rotulo.name === "Streaming");
    assert.ok(streaming, "a lista sugerida precisa trazer Streaming");

    await createSubscription(
      userId,
      {
        description: "Netflix",
        amount: cents(5_000),
        scheduleDay: 12,
        cardId: cartaoId,
        labelId: streaming.id,
      },
      AGORA,
    );
    await createSubscription(
      userId,
      { description: "Academia", amount: cents(15_000), scheduleDay: 5, cardId: cartaoId },
      AGORA,
    );

    const relatorio = await buildSubscriptionsReport(userId, AGORA);

    assert.equal(relatorio.totals.monthlyCents, 20_000);

    const comRotulo = relatorio.byLabel.find((linha) => linha.label?.id === streaming.id);
    const semRotulo = relatorio.byLabel.find((linha) => linha.label === null);

    assert.equal(comRotulo?.monthlyCents, 5_000);
    assert.equal(comRotulo?.sharePercent, 25);
    assert.equal(semRotulo?.monthlyCents, 15_000, "sem classificação não pode sumir do total");
  });

  it("assinatura sem cartão nem conta é recusada", async () => {
    const { userId } = await ambiente();
    const { createSubscription } = await import("./subscriptions.ts");

    await assert.rejects(
      () =>
        createSubscription(
          userId,
          { description: "Fantasma", amount: cents(1_000), scheduleDay: 1 },
          AGORA,
        ),
      /cobrada/i,
      "uma assinatura que não sai de lugar nenhum não é um débito",
    );
  });

  it("a classificação criada pelo usuário fica disponível e é usada", async () => {
    const { userId, cartaoId } = await ambiente();
    const { createLabel, createSubscription, buildSubscriptionsReport } = await import(
      "./subscriptions.ts"
    );

    const jogos = await createLabel(userId, { name: "Jogos", color: "#8b5cf6" }, AGORA);
    await createSubscription(
      userId,
      {
        description: "Game Pass",
        amount: cents(4_500),
        scheduleDay: 8,
        cardId: cartaoId,
        labelId: jogos,
      },
      AGORA,
    );

    const relatorio = await buildSubscriptionsReport(userId, AGORA);

    assert.equal(relatorio.subscriptions[0].label?.name, "Jogos");
    assert.equal(relatorio.byLabel[0].label?.color, "#8b5cf6");
  });
});
