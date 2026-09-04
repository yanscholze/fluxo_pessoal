/**
 * Assinaturas, contra o banco.
 *
 * O que precisa ficar provado aqui é o que a tela promete e ninguém confere: a
 * anual entra no mês como um doze avos, a pausada não soma, e a classificação
 * divide o bolo. Esses três números são a razão da aba existir — se algum
 * estiver errado, o usuário cancela a assinatura errada.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-09-10T12:00:00Z");

describe("relatório de assinaturas", () => {
  beforeEach(() => zerar());

  it("separa por classificação e mostra o custo anual", async () => {
    const { createLabel, createSubscription, buildSubscriptionsReport } = await import("./subscriptions.ts");
    const alvo = await ambiente();

    const streaming = await createLabel(alvo.userId, { name: "Streaming" }, AGORA);
    const ia = await createLabel(alvo.userId, { name: "IA" }, AGORA);

    await createSubscription(
      alvo.userId,
      { description: "Netflix", amount: cents(5_590), scheduleDay: 12, cardId: alvo.cartaoId, labelId: streaming },
      AGORA,
    );
    await createSubscription(
      alvo.userId,
      { description: "Spotify", amount: cents(2_190), scheduleDay: 15, cardId: alvo.cartaoId, labelId: streaming },
      AGORA,
    );
    await createSubscription(
      alvo.userId,
      { description: "Claude", amount: cents(10_000), scheduleDay: 5, cardId: alvo.cartaoId, labelId: ia },
      AGORA,
    );

    const relatorio = await buildSubscriptionsReport(alvo.userId, AGORA);

    assert.equal(relatorio.totals.monthlyCents, 17_780);
    assert.equal(relatorio.totals.yearlyCents, 213_360, "o anual anda ao lado do mensal");
    assert.equal(relatorio.totals.activeCount, 3);

    const porStreaming = relatorio.byLabel.find((linha) => linha.label?.name === "Streaming");
    assert.equal(porStreaming?.monthlyCents, 7_780);
    assert.equal(porStreaming?.count, 2);
  });

  it("a anual entra como um doze avos do mês", async () => {
    const { createSubscription, buildSubscriptionsReport } = await import("./subscriptions.ts");
    const alvo = await ambiente();

    await createSubscription(
      alvo.userId,
      {
        description: "Domínio",
        amount: cents(12_000),
        scheduleDay: 1,
        cardId: alvo.cartaoId,
        interval: "yearly",
      },
      AGORA,
    );

    const relatorio = await buildSubscriptionsReport(alvo.userId, AGORA);
    // Somar os 120,00 cheios faria o "gasto do mês" ser verdade em um mês e
    // falso nos outros onze.
    assert.equal(relatorio.totals.monthlyCents, 1_000);
    assert.equal(relatorio.totals.yearlyCents, 12_000);
  });

  it("assinatura pausada não soma no total do mês", async () => {
    const { createSubscription, buildSubscriptionsReport } = await import("./subscriptions.ts");
    const { setRecurrenceActive } = await import("./recurrences.ts");
    const alvo = await ambiente();

    const id = await createSubscription(
      alvo.userId,
      { description: "Netflix", amount: cents(5_590), scheduleDay: 12, cardId: alvo.cartaoId },
      AGORA,
    );
    await setRecurrenceActive(alvo.userId, id, false, AGORA);

    const relatorio = await buildSubscriptionsReport(alvo.userId, AGORA);
    assert.equal(relatorio.totals.monthlyCents, 0);
    assert.equal(relatorio.totals.pausedCount, 1);
  });

  it("recusa assinatura sem cartão nem conta", async () => {
    const { createSubscription } = await import("./subscriptions.ts");
    const alvo = await ambiente();

    await assert.rejects(
      () => createSubscription(alvo.userId, { description: "Fantasma", amount: cents(1_000), scheduleDay: 1 }, AGORA),
      /onde a assinatura é cobrada/,
    );
  });

  it("agrupa por cartão, para saber o que pesa em cada fatura", async () => {
    const { createSubscription, buildSubscriptionsReport } = await import("./subscriptions.ts");
    const alvo = await ambiente();

    await createSubscription(
      alvo.userId,
      { description: "Netflix", amount: cents(5_590), scheduleDay: 12, cardId: alvo.cartaoId },
      AGORA,
    );
    await createSubscription(
      alvo.userId,
      { description: "Jornal", amount: cents(3_000), scheduleDay: 5, accountId: alvo.contaId },
      AGORA,
    );

    const relatorio = await buildSubscriptionsReport(alvo.userId, AGORA);
    assert.equal(relatorio.byCard.length, 2);
    assert.equal(relatorio.byCard.find((linha) => linha.cardId === null)?.cardName, "Débito em conta");
  });
});

describe("classificação de assinatura", () => {
  beforeEach(() => {
    zerar();
  });

  it("a classificação criada pelo usuário fica disponível e é usada", async () => {
    const { createLabel, createSubscription, buildSubscriptionsReport } = await import(
      "./subscriptions.ts"
    );
    const alvo = await ambiente();

    const jogos = await createLabel(alvo.userId, { name: "Jogos", color: "#8b5cf6" }, AGORA);
    await createSubscription(
      alvo.userId,
      {
        description: "Game Pass",
        amount: cents(4_500),
        scheduleDay: 8,
        cardId: alvo.cartaoId,
        labelId: jogos,
      },
      AGORA,
    );

    const relatorio = await buildSubscriptionsReport(alvo.userId, AGORA);

    assert.equal(relatorio.subscriptions[0].label?.name, "Jogos");
    assert.equal(relatorio.byLabel[0].label?.color, "#8b5cf6");
  });

  it("a classificação arquivada some da lista mas não apaga a assinatura", async () => {
    const { archiveLabel, createLabel, createSubscription, buildSubscriptionsReport } = await import(
      "./subscriptions.ts"
    );
    const alvo = await ambiente();

    const jogos = await createLabel(alvo.userId, { name: "Jogos" }, AGORA);
    await createSubscription(
      alvo.userId,
      {
        description: "Game Pass",
        amount: cents(4_500),
        scheduleDay: 8,
        cardId: alvo.cartaoId,
        labelId: jogos,
      },
      AGORA,
    );
    await archiveLabel(alvo.userId, jogos, AGORA);

    const relatorio = await buildSubscriptionsReport(alvo.userId, AGORA);

    assert.equal(relatorio.labels.some((rotulo) => rotulo.id === jogos), false);
    assert.equal(relatorio.totals.monthlyCents, 4_500, "a assinatura continua custando o mesmo");
  });
});
