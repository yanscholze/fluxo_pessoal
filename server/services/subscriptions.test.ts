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
import { localDate } from "../../core/time/local-date.ts";
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

  it("preserva os centavos anuais sem multiplicar o mensal arredondado", async () => {
    const { createLabel, createSubscription, buildSubscriptionsReport } = await import("./subscriptions.ts");
    const { setRecurrenceActive } = await import("./recurrences.ts");
    const alvo = await ambiente();
    const labelId = await createLabel(alvo.userId, { name: "Software" }, AGORA);
    const anual = await createSubscription(alvo.userId, {
      description: "Licença anual", amount: cents(12_001), scheduleDay: 1,
      cardId: alvo.cartaoId, interval: "yearly", labelId,
    }, AGORA);
    const segundaAnual = await createSubscription(alvo.userId, {
      description: "Outra licença anual", amount: cents(12_501), scheduleDay: 2,
      cardId: alvo.cartaoId, interval: "yearly", labelId,
    }, AGORA);
    await createSubscription(alvo.userId, {
      description: "Serviço mensal", amount: cents(3_000), scheduleDay: 5,
      accountId: alvo.contaId, labelId,
    }, AGORA);

    const report = await buildSubscriptionsReport(alvo.userId, AGORA);
    assert.equal(report.subscriptions.find((item) => item.id === anual)?.monthlyCents, 1_000);
    assert.equal(report.subscriptions.find((item) => item.id === anual)?.yearlyCents, 12_001);
    assert.equal(report.subscriptions.find((item) => item.id === segundaAnual)?.monthlyCents, 1_042);
    assert.equal(report.totals.monthlyCents, 5_042);
    assert.equal(report.totals.yearlyCents, 60_502);
    assert.equal(report.byLabel.find((group) => group.label?.id === labelId)?.yearlyCents, 60_502);

    await setRecurrenceActive(alvo.userId, segundaAnual, false, AGORA);
    const paused = await buildSubscriptionsReport(alvo.userId, AGORA);
    assert.equal(paused.totals.monthlyCents, 4_000);
    assert.equal(paused.totals.yearlyCents, 48_001);
    assert.equal(paused.byLabel.find((group) => group.label?.id === labelId)?.yearlyCents, 48_001);
  });

  it("descreve o dia fixo do cartão sem prometer ajuste para dia útil", async () => {
    const { createSubscription } = await import("./subscriptions.ts");
    const { buildPlanningView } = await import("./planning.ts");
    const alvo = await ambiente();
    const now = new Date("2026-08-10T12:00:00Z");
    const card = await createSubscription(alvo.userId, {
      description: "Cobrança no cartão", amount: cents(2_000), scheduleDay: 15,
      cardId: alvo.cartaoId, startsOn: localDate("2026-08-01"),
    }, now);
    const account = await createSubscription(alvo.userId, {
      description: "Cobrança em conta", amount: cents(3_000), scheduleDay: 15,
      accountId: alvo.contaId, startsOn: localDate("2026-08-01"),
    }, now);
    const view = await buildPlanningView(alvo.userId, now);
    const cardRow = view.recurrences.find((item) => item.id === card);
    const accountRow = view.recurrences.find((item) => item.id === account);
    assert.equal(cardRow?.next?.date, "2026-08-15");
    assert.match(cardRow?.scheduleLabel ?? "", /sem ajuste de dia útil/u);
    assert.equal(accountRow?.next?.date, "2026-08-17");
    assert.match(accountRow?.scheduleLabel ?? "", /próximo dia útil/u);
  });

  it("mantém o custo equivalente do planejamento igual ao relatório sem amortizar as cobranças previstas", async () => {
    const { createSubscription, buildSubscriptionsReport } = await import("./subscriptions.ts");
    const { buildPlanningView } = await import("./planning.ts");
    const { setRecurrenceActive } = await import("./recurrences.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const { loadLedger } = await import("../repositories/ledger.ts");
    const alvo = await ambiente();
    const annual = await createSubscription(alvo.userId, {
      description: "Licença anual com centavos", amount: cents(12_001), scheduleDay: 15,
      cardId: alvo.cartaoId, interval: "yearly", startsOn: localDate("2026-09-01"),
    }, AGORA);
    await createSubscription(alvo.userId, {
      description: "Serviço mensal", amount: cents(2_400), scheduleDay: 20,
      accountId: alvo.contaId, startsOn: localDate("2026-09-01"),
    }, AGORA);

    const first = await buildPlanningView(alvo.userId, AGORA);
    const firstReport = await buildSubscriptionsReport(alvo.userId, AGORA);
    assert.equal(first.subscriptions.monthlyCents, 3_400);
    assert.equal(first.subscriptions.yearlyCents, 40_801);
    assert.equal(first.subscriptions.monthlyCents, firstReport.totals.monthlyCents);
    assert.equal(first.subscriptions.yearlyCents, firstReport.totals.yearlyCents);
    assert.equal(first.subscriptions.upcoming.find((item) => item.recurrenceId === annual)?.amountCents, 12_001,
      "equivalent monthly cost does not replace the full amount due");

    await createSubscription(alvo.userId, {
      description: "Outra anual com centavos", amount: cents(12_005), scheduleDay: 16,
      cardId: alvo.cartaoId, interval: "yearly", startsOn: localDate("2026-09-01"),
    }, AGORA);
    const paused = await createSubscription(alvo.userId, {
      description: "Anual pausada", amount: cents(99_999), scheduleDay: 17,
      cardId: alvo.cartaoId, interval: "yearly", startsOn: localDate("2026-09-01"),
    }, AGORA);
    await setRecurrenceActive(alvo.userId, paused, false, AGORA);
    const beforeDashboard = await buildDashboard(alvo.userId, AGORA);
    const beforeLedger = await loadLedger(alvo.userId);
    const view = await buildPlanningView(alvo.userId, AGORA);
    const report = await buildSubscriptionsReport(alvo.userId, AGORA);
    assert.equal(view.subscriptions.activeCount, 3);
    assert.equal(view.subscriptions.monthlyCents, 4_400, "round each annual subscription before summing monthly equivalents");
    assert.equal(view.subscriptions.yearlyCents, 52_806, "retain exact annual cents instead of multiplying rounded monthly values");
    assert.equal(view.subscriptions.monthlyCents, report.totals.monthlyCents);
    assert.equal(view.subscriptions.yearlyCents, report.totals.yearlyCents);
    assert.equal(view.subscriptions.next7DaysCents, 24_006, "the upcoming calendar still uses the actual full charges");
    assert.deepEqual((await buildDashboard(alvo.userId, AGORA)).freeToSpend, beforeDashboard.freeToSpend);
    assert.deepEqual(await loadLedger(alvo.userId), beforeLedger);
  });

  it("retira ocorrências já realizadas da agenda e conserva as próximas cobranças previstas", async () => {
    const { createSubscription } = await import("./subscriptions.ts");
    const { postDueCardSubscriptions } = await import("./subscription-posting.ts");
    const { confirmOccurrence } = await import("./recurrences.ts");
    const { buildPlanningView } = await import("./planning.ts");
    const { competence } = await import("../../core/time/competence.ts");
    const alvo = await ambiente();
    const startsOn = localDate("2026-09-01");
    const postedToday = await createSubscription(alvo.userId, {
      description: "Cartão já cobrado hoje", amount: cents(10_324), scheduleDay: 10,
      cardId: alvo.cartaoId, startsOn,
    }, AGORA);
    const prepaid = await createSubscription(alvo.userId, {
      description: "Conta paga antecipadamente", amount: cents(1_500), scheduleDay: 16,
      accountId: alvo.contaId, startsOn,
    }, AGORA);
    const futureCard = await createSubscription(alvo.userId, {
      description: "Próxima cobrança no cartão", amount: cents(2_200), scheduleDay: 12,
      cardId: alvo.cartaoId, startsOn,
    }, AGORA);
    const futureAccount = await createSubscription(alvo.userId, {
      description: "Próximo débito em conta", amount: cents(3_300), scheduleDay: 15,
      accountId: alvo.contaId, startsOn,
    }, AGORA);
    await postDueCardSubscriptions(alvo.userId, AGORA);
    await confirmOccurrence(alvo.userId, prepaid, competence("2026-09"), {
      occurredOn: localDate("2026-09-09"),
    }, AGORA);

    const view = await buildPlanningView(alvo.userId, AGORA);
    assert.ok(!view.subscriptions.upcoming.some((item) => item.recurrenceId === postedToday && item.date === "2026-09-10"));
    assert.ok(!view.subscriptions.upcoming.some((item) => item.recurrenceId === prepaid && item.date === "2026-09-16"));
    assert.ok(view.subscriptions.upcoming.some((item) => item.recurrenceId === futureCard && item.amountCents === 2_200));
    assert.ok(view.subscriptions.upcoming.some((item) => item.recurrenceId === futureAccount && item.amountCents === 3_300));
    assert.equal(view.subscriptions.next7DaysCents, 5_500, "a paid occurrence is not charged again in the pending calendar");
    assert.equal(view.recurrences.find((item) => item.id === postedToday)?.next?.date, "2026-10-10",
      "the next-charge table also skips the card occurrence already posted today");
    assert.equal(view.recurrences.find((item) => item.id === prepaid)?.next?.date, "2026-10-16",
      "prepayment advances the displayed next account charge without changing the schedule");
    assert.ok(view.subscriptions.upcoming.some((item) => item.recurrenceId === postedToday && item.date === "2026-10-10"),
      "settlement applies to the current occurrence, not to future months");
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

describe("edição de assinatura", () => {
  beforeEach(() => {
    zerar();
  });

  it("o reajuste muda o valor sem perder classificação nem cartão", async () => {
    const { createLabel, createSubscription, updateSubscription, buildSubscriptionsReport } =
      await import("./subscriptions.ts");
    const alvo = await ambiente();

    const rotulo = await createLabel(alvo.userId, { name: "Streaming" }, AGORA);
    const id = await createSubscription(
      alvo.userId,
      {
        description: "Netflix",
        amount: cents(5_590),
        scheduleDay: 12,
        cardId: alvo.cartaoId,
        labelId: rotulo,
      },
      AGORA,
    );

    await updateSubscription(alvo.userId, id, { amount: cents(6_290) }, AGORA);

    const [assinatura] = (await buildSubscriptionsReport(alvo.userId, AGORA)).subscriptions;
    assert.equal(assinatura.amountCents, 6_290);
    assert.equal(assinatura.label?.id, rotulo, "o reajuste não pode zerar a classificação");
    assert.equal(assinatura.cardId, alvo.cartaoId);
  });

  it("trocar o cartão pela conta limpa o cartão, para a cobrança não contar duas vezes", async () => {
    const { createSubscription, updateSubscription, buildSubscriptionsReport } = await import(
      "./subscriptions.ts"
    );
    const alvo = await ambiente();

    const id = await createSubscription(
      alvo.userId,
      { description: "Jornal", amount: cents(3_000), scheduleDay: 5, cardId: alvo.cartaoId },
      AGORA,
    );

    await updateSubscription(alvo.userId, id, { accountId: alvo.contaId }, AGORA);

    const [assinatura] = (await buildSubscriptionsReport(alvo.userId, AGORA)).subscriptions;
    assert.equal(assinatura.cardId, null);
    assert.equal(assinatura.accountId, alvo.contaId);
  });

  it("limpar a classificação é diferente de não mexer nela", async () => {
    const { createLabel, createSubscription, updateSubscription, buildSubscriptionsReport } =
      await import("./subscriptions.ts");
    const alvo = await ambiente();

    const rotulo = await createLabel(alvo.userId, { name: "Streaming" }, AGORA);
    const id = await createSubscription(
      alvo.userId,
      {
        description: "Netflix",
        amount: cents(5_590),
        scheduleDay: 12,
        cardId: alvo.cartaoId,
        labelId: rotulo,
      },
      AGORA,
    );

    // Sem `clearLabel`, um patch de valor preserva a classificação.
    await updateSubscription(alvo.userId, id, { amount: cents(5_990) }, AGORA);
    assert.equal(
      (await buildSubscriptionsReport(alvo.userId, AGORA)).subscriptions[0].label?.id,
      rotulo,
    );

    await updateSubscription(alvo.userId, id, { clearLabel: true }, AGORA);
    assert.equal((await buildSubscriptionsReport(alvo.userId, AGORA)).subscriptions[0].label, null);
  });

  it("cancelar a assinatura tira ela da lista", async () => {
    const { createSubscription, buildSubscriptionsReport } = await import("./subscriptions.ts");
    const { removeRecurrence } = await import("./recurrences.ts");
    const alvo = await ambiente();

    const id = await createSubscription(
      alvo.userId,
      { description: "Netflix", amount: cents(5_590), scheduleDay: 12, cardId: alvo.cartaoId },
      AGORA,
    );

    assert.equal(await removeRecurrence(alvo.userId, id), true);

    const relatorio = await buildSubscriptionsReport(alvo.userId, AGORA);
    assert.equal(relatorio.subscriptions.length, 0);
    assert.equal(relatorio.totals.monthlyCents, 0);

    // Segunda chamada não é erro: o botão pode ser clicado duas vezes.
    assert.equal(await removeRecurrence(alvo.userId, id), false);
  });

  it("a assinatura de um usuário não é editável por outro", async () => {
    const { createSubscription, updateSubscription } = await import("./subscriptions.ts");
    const { removeRecurrence } = await import("./recurrences.ts");
    const { signUp } = await import("./auth.ts");
    const alvo = await ambiente();

    const id = await createSubscription(
      alvo.userId,
      { description: "Netflix", amount: cents(5_590), scheduleDay: 12, cardId: alvo.cartaoId },
      AGORA,
    );

    const { user: outro } = await signUp({
      email: "outro@fluxo.app",
      password: "senha-de-teste-123",
      displayName: "Outra Pessoa",
    });

    await assert.rejects(() => updateSubscription(outro.id, id, { amount: cents(1) }, AGORA));
    assert.equal(await removeRecurrence(outro.id, id), false);
  });
});
