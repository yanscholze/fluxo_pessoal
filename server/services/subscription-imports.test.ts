import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";

import { DomainError } from "../../core/kernel/errors.ts";
import { cents } from "../../core/kernel/money.ts";
import { competence } from "../../core/time/competence.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const NOW = new Date("2026-08-15T12:00:00Z");
const CREATED = new Date("2026-08-01T12:00:00Z");

async function postedSubscription() {
  const { createSubscription } = await import("./subscriptions.ts");
  const { postDueCardSubscriptions } = await import("./subscription-posting.ts");
  const owner = await ambiente();
  const recurrenceId = await createSubscription(owner.userId, {
    description: "Editor Pro", amount: cents(10_324), scheduleDay: 15,
    cardId: owner.cartaoId, categoryId: owner.categoriaId, startsOn: localDate("2026-08-01"),
  }, CREATED);
  const result = await postDueCardSubscriptions(owner.userId, NOW);
  assert.equal(result.created, 1);
  return { ...owner, recurrenceId };
}

async function csvBatch(userId: string, cardId: string, lines: readonly string[], installment = false) {
  const { startImport, acceptAllPending } = await import("./imports.ts");
  const batch = await startImport(userId, {
    filename: "subscription-statement.csv", cardId, competence: competence("2026-09"),
    content: [installment ? "data,descricao,valor,parcela" : "data,descricao,valor", ...lines].join("\n"),
  }, NOW);
  await acceptAllPending(userId, batch.id);
  return batch;
}

async function ofxBatch(userId: string, cardId: string, fitid: string) {
  const { startImport, acceptAllPending } = await import("./imports.ts");
  const batch = await startImport(userId, {
    filename: "subscription-statement.ofx", cardId, competence: competence("2026-09"),
    content: `<OFX><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260815<TRNAMT>-103.24<FITID>${fitid}<NAME>Editor Pro</STMTTRN></BANKTRANLIST></OFX>`,
  }, NOW);
  await acceptAllPending(userId, batch.id);
  return batch;
}

describe("assinatura automática e importação", () => {
  beforeEach(() => zerar());

  it("vincula o extrato ao lançamento automático e reconhece a impressão digital bancária na reimportação", async () => {
    const { commitBatch, startImport, findBatch } = await import("./imports.ts");
    const { listTransactions, loadLedger } = await import("../repositories/ledger.ts");
    const { getDatabase } = await import("../db/client.ts");
    const { transactions, importItems } = await import("../db/schema/index.ts");
    const owner = await postedSubscription();
    const before = await listTransactions(owner.userId);
    const ledger = await loadLedger(owner.userId);
    assert.equal(before.length, 1);
    const batch = await csvBatch(owner.userId, owner.cartaoId, ["2026-08-15,Editor Pro,-103.24"]);

    assert.deepEqual(await commitBatch(owner.userId, batch.id, NOW), { created: 0, skipped: 1 });
    const review = await findBatch(owner.userId, batch.id);
    assert.equal(review?.batch.status, "committed");
    assert.equal(review?.items[0].verdict, "duplicado");
    assert.equal(review?.items[0].decision, "ignorar");
    const [alias] = await getDatabase().select({ transactionId: importItems.transactionId })
      .from(importItems).where(eq(importItems.batchId, batch.id));
    assert.equal(alias.transactionId, before[0].id);
    const [canonical] = await getDatabase().select({ fingerprint: transactions.fingerprint })
      .from(transactions).where(eq(transactions.id, before[0].id));
    assert.equal(canonical.fingerprint, `recurrence:${owner.recurrenceId}:2026-08`);
    assert.deepEqual(await listTransactions(owner.userId), before);
    assert.deepEqual(await loadLedger(owner.userId), ledger);

    const repeated = await startImport(owner.userId, {
      filename: "statement-again.csv", cardId: owner.cartaoId, competence: competence("2026-09"),
      content: "data,descricao,valor\n2026-08-15,Editor Pro,-103.24",
    }, NOW);
    assert.equal(repeated.counts.duplicates, 1, "committed bank aliases participate in the normal import review");
    assert.deepEqual(await commitBatch(owner.userId, repeated.id, NOW), { created: 0, skipped: 1 });
    assert.deepEqual(await loadLedger(owner.userId), ledger);
  });

  it("não confunde outro cartão, outro estabelecimento ou parcela com a assinatura", async () => {
    const { createCard } = await import("./catalog.ts");
    const { commitBatch } = await import("./imports.ts");
    const { listTransactions } = await import("../repositories/ledger.ts");
    const owner = await postedSubscription();
    const otherCard = await createCard(owner.userId, {
      name: "Outro cartão", kind: "credit", paymentAccountId: owner.contaId,
      closingDay: 13, dueDay: 20, dueAdjustment: "next", limit: cents(100_000),
    }, NOW);
    const wrongCard = await csvBatch(owner.userId, otherCard, ["2026-08-15,Editor Pro,-103.24"]);
    assert.deepEqual(await commitBatch(owner.userId, wrongCard.id, NOW), { created: 1, skipped: 0 });
    const otherMerchant = await csvBatch(owner.userId, owner.cartaoId, ["2026-08-15,Padaria Central,-103.24"]);
    assert.deepEqual(await commitBatch(owner.userId, otherMerchant.id, NOW), { created: 1, skipped: 0 });
    const installment = await csvBatch(owner.userId, owner.cartaoId, ["2026-08-15,Editor Pro,-103.24,1/2"], true);
    assert.deepEqual(await commitBatch(owner.userId, installment.id, NOW), { created: 1, skipped: 0 });
    assert.equal((await listTransactions(owner.userId)).length, 4);
  });

  it("deixa o lote em revisão e não grava parcialmente quando o valor da assinatura diverge", async () => {
    const { commitBatch, findBatch, startImport } = await import("./imports.ts");
    const { listTransactions, loadLedger } = await import("../repositories/ledger.ts");
    const owner = await postedSubscription();
    const before = await listTransactions(owner.userId);
    const ledger = await loadLedger(owner.userId);
    const batch = await csvBatch(owner.userId, owner.cartaoId, [
      "2026-08-15,Padaria Central,-12.00", "2026-08-15,Editor Pro,-109.99",
    ]);

    await assert.rejects(() => commitBatch(owner.userId, batch.id, NOW), (error) => error instanceof DomainError && error.code === "conflict");
    assert.equal((await findBatch(owner.userId, batch.id))?.batch.status, "review");
    assert.deepEqual(await listTransactions(owner.userId), before);
    assert.deepEqual(await loadLedger(owner.userId), ledger);
    const anotherReview = await startImport(owner.userId, {
      filename: "uncommitted-line.csv", cardId: owner.cartaoId, competence: competence("2026-09"),
      content: "data,descricao,valor\n2026-08-15,Editor Pro,-109.99",
    }, NOW);
    assert.equal(anotherReview.counts.duplicates, 0, "uncommitted review fingerprints are not treated as imported aliases");
  });

  it("não colapsa duas linhas bancárias distintas na mesma cobrança automática", async () => {
    const { commitBatch, findBatch } = await import("./imports.ts");
    const { listTransactions, loadLedger } = await import("../repositories/ledger.ts");
    const owner = await postedSubscription();
    const before = await listTransactions(owner.userId);
    const ledger = await loadLedger(owner.userId);
    const batch = await csvBatch(owner.userId, owner.cartaoId, [
      "2026-08-15,Editor-Pro,-103.24", "2026-08-15,Editor Pro,-103.24",
    ]);
    assert.equal((await findBatch(owner.userId, batch.id))?.items.length, 2);
    await assert.rejects(() => commitBatch(owner.userId, batch.id, NOW), (error) => error instanceof DomainError && error.code === "conflict");
    assert.equal((await findBatch(owner.userId, batch.id))?.batch.status, "review");
    assert.deepEqual(await listTransactions(owner.userId), before);
    assert.deepEqual(await loadLedger(owner.userId), ledger);
  });

  it("mantém a importação em revisão enquanto o agendador detém a trava", async () => {
    const { claimLease, releaseLease } = await import("../repositories/ai.ts");
    const { commitBatch, findBatch } = await import("./imports.ts");
    const { listTransactions, loadLedger } = await import("../repositories/ledger.ts");
    const owner = await postedSubscription();
    const before = await listTransactions(owner.userId);
    const ledger = await loadLedger(owner.userId);
    const batch = await csvBatch(owner.userId, owner.cartaoId, ["2026-08-15,Padaria Central,-12.00"]);
    const lease = await claimLease(owner.userId, "card-subscriptions", NOW);
    assert.ok(lease);
    try {
      await assert.rejects(() => commitBatch(owner.userId, batch.id, NOW), (error) => error instanceof DomainError && error.code === "conflict");
      assert.equal((await findBatch(owner.userId, batch.id))?.batch.status, "review");
      assert.deepEqual(await listTransactions(owner.userId), before);
      assert.deepEqual(await loadLedger(owner.userId), ledger);
    } finally {
      await releaseLease(lease);
    }
    assert.deepEqual(await commitBatch(owner.userId, batch.id, NOW), { created: 1, skipped: 0 });
  });

  it("exige revisão quando uma cobrança importada vinculada aparece com outra identidade bancária", async () => {
    const { createSubscription } = await import("./subscriptions.ts");
    const { postDueCardSubscriptions } = await import("./subscription-posting.ts");
    const { commitBatch, findBatch } = await import("./imports.ts");
    const { listTransactions, loadLedger } = await import("../repositories/ledger.ts");
    const owner = await ambiente();
    await createSubscription(owner.userId, {
      description: "Editor Pro", amount: cents(10_324), scheduleDay: 15,
      cardId: owner.cartaoId, startsOn: localDate("2026-08-01"),
    }, CREATED);
    const first = await csvBatch(owner.userId, owner.cartaoId, ["2026-08-15,Editor-Pro,-103.24"]);
    assert.deepEqual(await commitBatch(owner.userId, first.id, NOW), { created: 1, skipped: 0 });
    assert.equal((await postDueCardSubscriptions(owner.userId, NOW)).linked, 1);
    const before = await listTransactions(owner.userId);
    const ledger = await loadLedger(owner.userId);
    assert.equal(before[0].source, "import", "linking keeps the existing bank provenance");

    const second = await csvBatch(owner.userId, owner.cartaoId, ["2026-08-15,Editor Pro,-103.24"]);
    assert.equal(second.counts.duplicates, 0, "the punctuation change produces a different bank fingerprint");
    await assert.rejects(() => commitBatch(owner.userId, second.id, NOW), (error) => error instanceof DomainError && error.code === "conflict");
    assert.equal((await findBatch(owner.userId, second.id))?.batch.status, "review");
    assert.deepEqual(await listTransactions(owner.userId), before);
    assert.deepEqual(await loadLedger(owner.userId), ledger);
  });

  it("não ignora silenciosamente outro FITID para uma assinatura que já tem identidade bancária", async () => {
    const { commitBatch, findBatch } = await import("./imports.ts");
    const { listTransactions, loadLedger } = await import("../repositories/ledger.ts");
    const owner = await postedSubscription();
    const first = await ofxBatch(owner.userId, owner.cartaoId, "bank-charge-a");
    assert.deepEqual(await commitBatch(owner.userId, first.id, NOW), { created: 0, skipped: 1 });
    const before = await listTransactions(owner.userId);
    const ledger = await loadLedger(owner.userId);
    const different = await ofxBatch(owner.userId, owner.cartaoId, "bank-charge-b");
    assert.equal(different.counts.duplicates, 0);
    await assert.rejects(() => commitBatch(owner.userId, different.id, NOW), (error) => error instanceof DomainError && error.code === "conflict");
    assert.equal((await findBatch(owner.userId, different.id))?.batch.status, "review");
    const repeated = await ofxBatch(owner.userId, owner.cartaoId, "bank-charge-a");
    assert.equal(repeated.counts.duplicates, 1);
    assert.deepEqual(await commitBatch(owner.userId, repeated.id, NOW), { created: 0, skipped: 1 });
    assert.deepEqual(await listTransactions(owner.userId), before);
    assert.deepEqual(await loadLedger(owner.userId), ledger);
  });

  it("reconhece uma cobrança automática histórica mesmo após excluir a regra", async () => {
    const { removeRecurrence } = await import("./recurrences.ts");
    const { commitBatch } = await import("./imports.ts");
    const { listTransactions, loadLedger } = await import("../repositories/ledger.ts");
    const owner = await postedSubscription();
    await removeRecurrence(owner.userId, owner.recurrenceId);
    const before = await listTransactions(owner.userId);
    const ledger = await loadLedger(owner.userId);
    const batch = await csvBatch(owner.userId, owner.cartaoId, ["2026-08-15,Editor Pro,-103.24"]);
    assert.deepEqual(await commitBatch(owner.userId, batch.id, NOW), { created: 0, skipped: 1 });
    assert.deepEqual(await listTransactions(owner.userId), before);
    assert.deepEqual(await loadLedger(owner.userId), ledger);
  });

  it("serializa confirmação de extrato e agendamento concorrentes sem duplicar a cobrança", async () => {
    const { createSubscription } = await import("./subscriptions.ts");
    const { postDueCardSubscriptions } = await import("./subscription-posting.ts");
    const { commitBatch, findBatch } = await import("./imports.ts");
    const { listTransactions } = await import("../repositories/ledger.ts");
    const { confirmedOccurrence } = await import("../repositories/recurrences.ts");
    const owner = await ambiente();
    const recurrenceId = await createSubscription(owner.userId, {
      description: "Editor Pro", amount: cents(10_324), scheduleDay: 15,
      cardId: owner.cartaoId, startsOn: localDate("2026-08-01"),
    }, CREATED);
    const batch = await csvBatch(owner.userId, owner.cartaoId, ["2026-08-15,Editor Pro,-103.24"]);
    const outcomes = await Promise.allSettled([
      postDueCardSubscriptions(owner.userId, NOW), commitBatch(owner.userId, batch.id, NOW),
    ]);
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") assert.ok(outcome.reason instanceof DomainError && outcome.reason.code === "conflict");
    }
    if ((await findBatch(owner.userId, batch.id))?.batch.status === "review") await commitBatch(owner.userId, batch.id, NOW);
    await postDueCardSubscriptions(owner.userId, NOW);
    const recorded = await listTransactions(owner.userId);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].amount, 10_324);
    assert.equal((await confirmedOccurrence(owner.userId, recurrenceId, competence("2026-08")))?.transactionId, recorded[0].id);
  });
});
