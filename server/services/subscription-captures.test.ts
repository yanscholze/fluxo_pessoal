import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";

import { DomainError } from "../../core/kernel/errors.ts";
import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { captureEvents } from "../db/schema/index.ts";
import { claimLease, releaseLease } from "../repositories/ai.ts";
import { listTransactions, loadLedger } from "../repositories/ledger.ts";
import { ambiente, zerar } from "../testing/cenario.ts";
import { createAccount, createCard } from "./catalog.ts";
import { ingest, buildCapturesView, confirmCapture } from "./captures.ts";
import { postDueCardSubscriptions } from "./subscription-posting.ts";
import { createSubscription, updateSubscription } from "./subscriptions.ts";
import { recordTransaction } from "./transactions.ts";

const NOW = new Date("2026-08-15T12:00:00Z");

async function postedSubscription(source: "recurrence" | "manual" = "recurrence") {
  const owner = await ambiente();
  await createSubscription(owner.userId, {
    description: "Editor Pro", amount: cents(10_324), scheduleDay: 15,
    cardId: owner.cartaoId, categoryId: owner.categoriaId, startsOn: localDate("2026-08-01"),
  }, new Date("2026-08-01T12:00:00Z"));
  if (source === "manual") {
    await recordTransaction(owner.userId, {
      kind: "expense", description: "EDITOR-PRO", amount: cents(10_324),
      occurredOn: localDate("2026-08-15"), state: "confirmed", source,
      cardId: owner.cartaoId, categoryId: owner.categoriaId,
    }, NOW);
  }
  const result = await postDueCardSubscriptions(owner.userId, NOW);
  assert.equal(source === "manual" ? result.linked : result.created, 1);
  return owner;
}

/** Review can correct a generic merchant that was not recognized at ingestion. */
async function pendingCapture(userId: string, eventId: string, merchant = "Serviço avulso", amount = "103,24") {
  const result = await ingest(userId, [{
    sourceApp: "com.nu.production", title: "Compra no cartão de crédito",
    text: `Compra aprovada: R$ ${amount} em ${merchant}`,
    postedAt: NOW.getTime(), deviceEventId: eventId,
  }], NOW);
  assert.equal(result.captured, 1);
  const pending = (await buildCapturesView(userId, NOW)).pending;
  assert.equal(pending.length, 1, "a notificação genérica fica disponível para revisão");
  return pending[0];
}

describe("assinatura automática e revisão de captura", () => {
  beforeEach(() => zerar());

  for (const source of ["recurrence", "manual"] as const) {
    it(`reutiliza a cobrança ${source} já vinculada após corrigir o nome na revisão`, async () => {
      const owner = await postedSubscription(source);
      const [canonical] = await listTransactions(owner.userId);
      const before = await listTransactions(owner.userId);
      const ledger = await loadLedger(owner.userId);
      const capture = await pendingCapture(owner.userId, `generic-${source}`);

      const result = await confirmCapture(owner.userId, capture.id, {
        cardId: owner.cartaoId, categoryId: owner.categoriaId,
        description: " ÉDITOR   PRO!!! ", amount: cents(10_324), occurredOn: localDate("2026-08-15"),
      }, NOW);

      assert.equal(result.transactionId, canonical.id);
      assert.equal(result.competence, canonical.competence);
      assert.deepEqual(await listTransactions(owner.userId), before);
      assert.deepEqual(await loadLedger(owner.userId), ledger);
      const [resolved] = await getDatabase().select().from(captureEvents).where(eq(captureEvents.id, capture.id));
      assert.equal(resolved.status, "confirmado");
      assert.equal(resolved.transactionId, canonical.id);
      assert.equal((await buildCapturesView(owner.userId, NOW)).pending.length, 0);
      assert.deepEqual(await confirmCapture(owner.userId, capture.id, {
        cardId: owner.cartaoId, description: "Editor Pro", amount: cents(10_324),
      }, NOW), result, "repetir a mesma confirmação devolve o fato existente");
      assert.deepEqual(await listTransactions(owner.userId), before);
      assert.deepEqual(await loadLedger(owner.userId), ledger);
    });
  }

  it("mantém outra identidade de captura em revisão em vez de esconder uma possível cobrança em dobro", async () => {
    const owner = await postedSubscription();
    const [canonical] = await listTransactions(owner.userId);
    const firstCapture = await pendingCapture(owner.userId, "first-bank-event", "Serviço A");
    await confirmCapture(owner.userId, firstCapture.id, {
      cardId: owner.cartaoId, description: "Editor Pro", amount: cents(10_324),
    }, NOW);
    const ledger = await loadLedger(owner.userId);
    const before = await listTransactions(owner.userId);
    const secondCapture = await pendingCapture(owner.userId, "second-bank-event", "Serviço B");

    await assert.rejects(() => confirmCapture(owner.userId, secondCapture.id, {
      cardId: owner.cartaoId, description: "Editor Pro", amount: cents(10_324),
    }, NOW), (error) => error instanceof DomainError && error.code === "conflict" && /outra notificação/.test(error.message));

    const [pending] = await getDatabase().select().from(captureEvents).where(eq(captureEvents.id, secondCapture.id));
    assert.equal(pending.status, "pendente");
    assert.equal(pending.transactionId, null);
    assert.equal((await buildCapturesView(owner.userId, NOW)).pending[0]?.id, secondCapture.id);
    assert.deepEqual(await listTransactions(owner.userId), before);
    assert.deepEqual(await loadLedger(owner.userId), ledger);
    assert.equal((await confirmCapture(owner.userId, firstCapture.id, {
      cardId: owner.cartaoId, description: "Editor Pro", amount: cents(10_324),
    }, NOW)).transactionId, canonical.id);

    const resent = await ingest(owner.userId, [{
      sourceApp: "com.nu.production", title: "Compra no cartão de crédito",
      text: "Compra aprovada: R$ 103,24 em Serviço A", postedAt: NOW.getTime(), deviceEventId: "first-bank-event",
    }], NOW);
    assert.equal(resent.captured, 0, "o reenvio da mesma notificação continua idempotente");
    assert.deepEqual(await listTransactions(owner.userId), before);
  });

  it("não junta outro cartão ou um estabelecimento apenas parecido com a assinatura", async () => {
    const owner = await postedSubscription();
    const [canonical] = await listTransactions(owner.userId);
    const otherCardId = await createCard(owner.userId, {
      name: "Outro cartão", kind: "credit", paymentAccountId: owner.contaId,
      closingDay: 13, dueDay: 20, dueAdjustment: "next", limit: cents(200_000),
    }, NOW);
    const otherCardCapture = await pendingCapture(owner.userId, "other-card", "Serviço A");
    const otherCard = await confirmCapture(owner.userId, otherCardCapture.id, {
      cardId: otherCardId, description: "Editor Pro", amount: cents(10_324),
    }, NOW);
    assert.notEqual(otherCard.transactionId, canonical.id);

    const merchantCapture = await pendingCapture(owner.userId, "other-service", "Serviço B");
    const otherService = await confirmCapture(owner.userId, merchantCapture.id, {
      cardId: owner.cartaoId, description: "Editor Pro Plus", amount: cents(10_324),
    }, NOW);
    assert.notEqual(otherService.transactionId, canonical.id);
    assert.notEqual(otherService.transactionId, otherCard.transactionId);
    const recorded = await listTransactions(owner.userId);
    assert.equal(recorded.length, 3);
    assert.equal(recorded.find((item) => item.id === canonical.id)?.recurrenceId, canonical.recurrenceId);
    assert.equal(recorded.find((item) => item.id === otherCard.transactionId)?.source, "capture");
    assert.equal(recorded.find((item) => item.id === otherService.transactionId)?.source, "capture");
  });

  it("aplica a mesma revisão de identidade quando a notificação casa por texto explícito", async () => {
    const owner = await postedSubscription();
    const [canonical] = await listTransactions(owner.userId);
    assert.ok(canonical.recurrenceId);
    await updateSubscription(owner.userId, canonical.recurrenceId, { captureMatch: "EDITORPAY" }, NOW);
    const first = await pendingCapture(owner.userId, "explicit-first", "Serviço A EDITORPAY");
    const result = await confirmCapture(owner.userId, first.id, { cardId: owner.cartaoId }, NOW);
    assert.equal(result.transactionId, canonical.id);
    const ledger = await loadLedger(owner.userId);
    const before = await listTransactions(owner.userId);
    const second = await pendingCapture(owner.userId, "explicit-second", "Serviço B EDITORPAY");

    await assert.rejects(() => confirmCapture(owner.userId, second.id, { cardId: owner.cartaoId }, NOW),
      (error) => error instanceof DomainError && error.code === "conflict" && /outra notificação/.test(error.message));

    const [pending] = await getDatabase().select().from(captureEvents).where(eq(captureEvents.id, second.id));
    assert.equal(pending.status, "pendente");
    assert.equal(pending.transactionId, null);
    assert.deepEqual(await confirmCapture(owner.userId, first.id, { cardId: owner.cartaoId }, NOW), result);
    assert.deepEqual(await listTransactions(owner.userId), before);
    assert.deepEqual(await loadLedger(owner.userId), ledger);
  });

  it("não ignora um preço diferente no vínculo explícito com uma ocorrência já lançada", async () => {
    const owner = await postedSubscription();
    const [canonical] = await listTransactions(owner.userId);
    assert.ok(canonical.recurrenceId);
    await updateSubscription(owner.userId, canonical.recurrenceId, { captureMatch: "EDITORPAY" }, NOW);
    const before = await listTransactions(owner.userId);
    const ledger = await loadLedger(owner.userId);
    const capture = await pendingCapture(owner.userId, "explicit-repriced", "Serviço EDITORPAY", "109,99");
    const [eventBefore] = await getDatabase().select().from(captureEvents).where(eq(captureEvents.id, capture.id));

    await assert.rejects(() => confirmCapture(owner.userId, capture.id, { cardId: owner.cartaoId }, NOW),
      (error) => error instanceof DomainError && error.code === "conflict" && /valor diferente/.test(error.message));

    assert.deepEqual(await listTransactions(owner.userId), before);
    assert.deepEqual(await loadLedger(owner.userId), ledger);
    const [eventAfter] = await getDatabase().select().from(captureEvents).where(eq(captureEvents.id, capture.id));
    assert.deepEqual(eventAfter, eventBefore, "a captura permanece em revisão, sem ser vinculada pelo valor antigo");
  });

  it("não ignora outro cartão escolhido quando o texto reconhece uma recorrência", async () => {
    const owner = await postedSubscription();
    const [canonical] = await listTransactions(owner.userId);
    assert.ok(canonical.recurrenceId);
    await updateSubscription(owner.userId, canonical.recurrenceId, { captureMatch: "EDITORPAY" }, NOW);
    const otherCard = await createCard(owner.userId, {
      name: "Outro cartão escolhido", kind: "credit", paymentAccountId: owner.contaId,
      closingDay: 13, dueDay: 20, dueAdjustment: "next", limit: cents(200_000),
    }, NOW);
    const capture = await pendingCapture(owner.userId, "explicit-origin-other-card", "Serviço EDITORPAY");
    const before = await listTransactions(owner.userId);
    const ledger = await loadLedger(owner.userId);
    const [eventBefore] = await getDatabase().select().from(captureEvents).where(eq(captureEvents.id, capture.id));

    await assert.rejects(() => confirmCapture(owner.userId, capture.id, { cardId: otherCard }, NOW),
      (error) => error instanceof DomainError && error.code === "conflict" && /origem escolhida/.test(error.message));

    assert.deepEqual(await listTransactions(owner.userId), before);
    assert.deepEqual(await loadLedger(owner.userId), ledger);
    const [eventAfter] = await getDatabase().select().from(captureEvents).where(eq(captureEvents.id, capture.id));
    assert.deepEqual(eventAfter, eventBefore, "a escolha divergente não é ignorada nem vincula a captura ao cartão errado");
    assert.equal((await confirmCapture(owner.userId, capture.id, { cardId: owner.cartaoId }, NOW)).transactionId, canonical.id);
    assert.deepEqual(await loadLedger(owner.userId), ledger);
  });

  it("não ignora outra conta escolhida e preserva a baixa sem origem explícita", async () => {
    const owner = await ambiente();
    const recurrenceId = await createSubscription(owner.userId, {
      description: "Editor Pro em conta", amount: cents(10_324), scheduleDay: 15,
      accountId: owner.contaId, startsOn: localDate("2026-08-01"),
    }, new Date("2026-08-01T12:00:00Z"));
    await updateSubscription(owner.userId, recurrenceId, { captureMatch: "EDITORPAY" }, NOW);
    const otherAccount = await createAccount(owner.userId, { name: "Outra conta escolhida", kind: "checking" }, NOW);
    const capture = await pendingCapture(owner.userId, "explicit-origin-other-account", "Serviço EDITORPAY");
    const ledger = await loadLedger(owner.userId);
    const [eventBefore] = await getDatabase().select().from(captureEvents).where(eq(captureEvents.id, capture.id));

    await assert.rejects(() => confirmCapture(owner.userId, capture.id, { accountId: otherAccount }, NOW),
      (error) => error instanceof DomainError && error.code === "conflict" && /origem escolhida/.test(error.message));

    assert.equal((await listTransactions(owner.userId)).length, 0, "a origem divergente é recusada antes da primeira gravação financeira");
    assert.deepEqual(await loadLedger(owner.userId), ledger);
    const [eventAfter] = await getDatabase().select().from(captureEvents).where(eq(captureEvents.id, capture.id));
    assert.deepEqual(eventAfter, eventBefore);
    const result = await confirmCapture(owner.userId, capture.id, {}, NOW);
    const [recorded] = await listTransactions(owner.userId);
    assert.equal(recorded.id, result.transactionId);
    assert.deepEqual(recorded.origin, { kind: "account", accountId: owner.contaId });
    assert.equal(recorded.amount, 10_324, "sem escolha explícita, continua usando a origem configurada da regra");
  });

  it("preserva o valor real da primeira baixa explícita quando ainda não há cobrança lançada", async () => {
    const owner = await ambiente();
    const recurrenceId = await createSubscription(owner.userId, {
      description: "Editor Pro", amount: cents(10_324), scheduleDay: 15,
      cardId: owner.cartaoId, startsOn: localDate("2026-08-01"),
    }, new Date("2026-08-01T12:00:00Z"));
    await updateSubscription(owner.userId, recurrenceId, { captureMatch: "EDITORPAY" }, NOW);
    const capture = await pendingCapture(owner.userId, "explicit-first-real-price", "Serviço EDITORPAY", "109,99");

    const result = await confirmCapture(owner.userId, capture.id, { cardId: owner.cartaoId }, NOW);

    const recorded = await listTransactions(owner.userId);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].id, result.transactionId);
    assert.equal(recorded[0].amount, 10_999, "o banco informa o valor realizado da primeira ocorrência");
    assert.equal(recorded[0].recurrenceId, recurrenceId);
    assert.equal(result.competence, recorded[0].competence);
    assert.equal((await buildCapturesView(owner.userId, NOW)).pending.length, 0);
  });

  it("mantém a captura pendente, sem gravação financeira, quando a cobrança tem preço diferente", async () => {
    const owner = await postedSubscription();
    const before = await listTransactions(owner.userId);
    const ledger = await loadLedger(owner.userId);
    const capture = await pendingCapture(owner.userId, "different-price", "Serviço avulso", "109,99");

    await assert.rejects(() => confirmCapture(owner.userId, capture.id, {
      cardId: owner.cartaoId, description: "Editor Pro", amount: cents(10_999),
    }, NOW), (error) => error instanceof DomainError && error.code === "conflict");

    assert.deepEqual(await listTransactions(owner.userId), before);
    assert.deepEqual(await loadLedger(owner.userId), ledger);
    assert.equal((await buildCapturesView(owner.userId, NOW)).pending[0]?.id, capture.id);
  });

  it("não confirma durante a trava do agendador e permite repetir depois sem duplicar", async () => {
    const owner = await postedSubscription();
    const [canonical] = await listTransactions(owner.userId);
    const capture = await pendingCapture(owner.userId, "busy-subscriptions");
    const before = await listTransactions(owner.userId);
    const ledger = await loadLedger(owner.userId);
    const [eventBefore] = await getDatabase().select().from(captureEvents).where(eq(captureEvents.id, capture.id));
    const lease = await claimLease(owner.userId, "card-subscriptions", NOW);
    assert.ok(lease);
    try {
      await assert.rejects(() => confirmCapture(owner.userId, capture.id, {
        cardId: owner.cartaoId, description: "Editor Pro", amount: cents(10_324),
      }, NOW), (error) => error instanceof DomainError && error.code === "conflict");
      assert.deepEqual(await listTransactions(owner.userId), before);
      assert.deepEqual(await loadLedger(owner.userId), ledger);
      const [eventAfter] = await getDatabase().select().from(captureEvents).where(eq(captureEvents.id, capture.id));
      assert.deepEqual(eventAfter, eventBefore);
    } finally { await releaseLease(lease); }

    const confirmed = await confirmCapture(owner.userId, capture.id, {
      cardId: owner.cartaoId, description: "Editor Pro", amount: cents(10_324),
    }, NOW);
    assert.equal(confirmed.transactionId, canonical.id);
    assert.deepEqual(await listTransactions(owner.userId), before);
    assert.deepEqual(await loadLedger(owner.userId), ledger);
  });
});
