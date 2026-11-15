import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { eq } from "drizzle-orm";

import { cents } from "../../core/kernel/money.ts";
import { competence } from "../../core/time/competence.ts";
import { localDate } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { transactions } from "../db/schema/index.ts";
import { cachedAnalysis } from "../repositories/ai.ts";
import { confirmedOccurrence } from "../repositories/recurrences.ts";
import { findTransaction, listTransactions, loadLedger, saveTransaction } from "../repositories/ledger.ts";
import { ambiente, type Ambiente, zerar } from "../testing/cenario.ts";
import { definirSegredo } from "../testing/worker-env.ts";
import { signUp } from "./auth.ts";
import { createAccount, createCard } from "./catalog.ts";
import { buildDashboard } from "./dashboard.ts";
import { setRecurrenceActive } from "./recurrences.ts";
import { createSubscription } from "./subscriptions.ts";
import { postDueCardSubscriptions, runScheduledCardSubscriptions } from "./subscription-posting.ts";
import { recordTransaction } from "./transactions.ts";

// November 15 is a Sunday: subscriptions use their actual billing day rather
// than moving the charge to Monday, including when the scheduler catches up.
const NOW = new Date("2026-11-16T12:00:00Z");
const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  zerar();
  definirSegredo("GEMINI_API_KEY", undefined);
  definirSegredo("GEMINI_USER_ID", undefined);
});
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH; });

async function subscription(owner: Ambiente, options: {
  description?: string;
  scheduleDay?: number;
  amountCents?: number;
  interval?: "monthly" | "yearly";
  startsOn?: string;
  account?: boolean;
} = {}) {
  return createSubscription(owner.userId, {
    description: options.description ?? "Streaming fictício",
    amount: cents(options.amountCents ?? 5_590),
    scheduleDay: options.scheduleDay ?? 15,
    categoryId: owner.categoriaId,
    interval: options.interval ?? "monthly",
    startsOn: localDate(options.startsOn ?? "2026-11-01"),
    ...(options.account ? { accountId: owner.contaId } : { cardId: owner.cartaoId }),
  }, NOW);
}

describe("lançamento automático das assinaturas no cartão", () => {
  it("materializa a cobrança no dia fixo e troca a previsão uma vez, sem debitar a conta", async () => {
    const owner = await ambiente(500_000);
    const id = await subscription(owner);
    const before = await buildDashboard(owner.userId, NOW);
    assert.equal((await listTransactions(owner.userId)).length, 0, "a leitura do painel continua sem criar cobranças");
    assert.equal(before.freeToSpend.otherCommitmentsCents, 5_590);

    const posted = await postDueCardSubscriptions(owner.userId, NOW);
    const saved = await listTransactions(owner.userId);
    const after = await buildDashboard(owner.userId, NOW);
    assert.equal(posted.created, 1);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].recurrenceId, id);
    assert.equal(saved[0].state, "confirmed");
    assert.equal(saved[0].occurredOn, "2026-11-15", "o domingo é preservado");
    assert.equal(saved[0].competence, "2026-12", "a compra entra na fatura definida pelo ciclo do cartão");
    assert.deepEqual(saved[0].origin, { kind: "card", cardId: owner.cartaoId });
    assert.equal(after.freeToSpend.liquidBalanceCents, before.freeToSpend.liquidBalanceCents);
    assert.equal(after.accounts.find((account) => account.id === owner.contaId)?.balanceCents, 500_000);
    assert.equal(after.freeToSpend.openInvoicesCents, 5_590);
    assert.equal(after.freeToSpend.otherCommitmentsCents, 0, "a ocorrência virtual já confirmada desaparece");
    assert.equal(after.freeToSpend.amountCents, before.freeToSpend.amountCents);
    assert.equal(after.cards[0].currentInvoice?.outstandingCents, 5_590);
  });

  it("é idempotente mesmo em chamadas simultâneas e repetidas", async () => {
    const owner = await ambiente();
    const id = await subscription(owner);
    const results = await Promise.all([
      postDueCardSubscriptions(owner.userId, NOW),
      postDueCardSubscriptions(owner.userId, NOW),
      postDueCardSubscriptions(owner.userId, NOW),
    ]);
    assert.equal(results.reduce((total, item) => total + item.created, 0), 1);
    assert.equal((await listTransactions(owner.userId)).length, 1);
    assert.ok(await confirmedOccurrence(owner.userId, id, competence("2026-11")));
    const before = await loadLedger(owner.userId);
    const repeated = await postDueCardSubscriptions(owner.userId, new Date(NOW.getTime() + 1_000));
    assert.equal(repeated.created, 0);
    assert.equal(repeated.linked, 0);
    assert.deepEqual(await loadLedger(owner.userId), before);
  });

  it("não antecipa cobranças futuras nem lança assinaturas pausadas ou debitadas em conta", async () => {
    const owner = await ambiente();
    const due = await subscription(owner);
    const future = await subscription(owner, { description: "Cobrança futura", scheduleDay: 20 });
    const paused = await subscription(owner, { description: "Pausada", scheduleDay: 10 });
    const account = await subscription(owner, { description: "Conta manual", account: true });
    const notStarted = await subscription(owner, { description: "Começa no próximo mês", startsOn: "2026-12-01" });
    await setRecurrenceActive(owner.userId, paused, false, NOW);

    const result = await postDueCardSubscriptions(owner.userId, NOW);
    const saved = await listTransactions(owner.userId);
    assert.equal(result.created, 1);
    assert.deepEqual(saved.map((transaction) => transaction.recurrenceId), [due]);
    for (const id of [future, paused, account, notStarted]) {
      assert.equal(await confirmedOccurrence(owner.userId, id, competence("2026-11")), null);
    }
  });

  it("processa só o mês atual, respeita o intervalo anual e não recria meses antigos", async () => {
    const owner = await ambiente();
    const monthly = await subscription(owner, { description: "Mensal", startsOn: "2026-01-01" });
    const yearly = await subscription(owner, { description: "Anual", interval: "yearly", startsOn: "2025-11-01", amountCents: 12_001 });
    const first = await postDueCardSubscriptions(owner.userId, NOW);
    assert.equal(first.created, 2);
    assert.equal((await listTransactions(owner.userId)).length, 2, "não lança janeiro a outubro retroativamente");

    const december = await postDueCardSubscriptions(owner.userId, new Date("2026-12-16T12:00:00Z"));
    assert.equal(december.created, 1);
    assert.ok(await confirmedOccurrence(owner.userId, monthly, competence("2026-12")));
    assert.equal(await confirmedOccurrence(owner.userId, yearly, competence("2026-12")), null);

    const nextYear = await postDueCardSubscriptions(owner.userId, new Date("2027-11-16T12:00:00Z"));
    assert.equal(nextYear.created, 2);
    assert.equal((await postDueCardSubscriptions(owner.userId, new Date("2027-11-16T13:00:00Z"))).created, 0);
    const saved = await listTransactions(owner.userId);
    assert.equal(saved.length, 5);
    assert.deepEqual(saved.filter((item) => item.recurrenceId === yearly).map((item) => item.amount).sort(), [12_001, 12_001]);
    assert.equal(await confirmedOccurrence(owner.userId, monthly, competence("2026-10")), null);
    assert.equal(await confirmedOccurrence(owner.userId, monthly, competence("2027-10")), null);
  });

  for (const source of ["manual", "import"] as const) {
    it(`vincula uma cobrança ${source} reconhecida pelo cartão, nome normalizado e valor, sem duplicar`, async () => {
      const owner = await ambiente();
      const id = await subscription(owner, { description: "Café Azul" });
      const matchNow = new Date("2026-11-20T12:00:00Z");
      const { ids } = await recordTransaction(owner.userId, {
        kind: "expense", description: "  CAFE   AZUL!!! ", amount: cents(5_590),
        cardId: owner.cartaoId, categoryId: owner.categoriaId,
        occurredOn: localDate(source === "manual" ? "2026-11-12" : "2026-11-18"), state: "confirmed", source,
      }, matchNow);
      const original = (await findTransaction(owner.userId, ids[0]))!;
      if (source === "import") await saveTransaction(original, { fingerprint: "ofx:original-charge-fixture" });
      const ledgerBefore = await loadLedger(owner.userId);
      const result = await postDueCardSubscriptions(owner.userId, matchNow);
      assert.equal(result.created, 0);
      assert.equal(result.linked, 1);
      assert.equal((await listTransactions(owner.userId)).length, 1);
      assert.equal((await confirmedOccurrence(owner.userId, id, competence("2026-11")))?.transactionId, ids[0]);
      const linked = (await findTransaction(owner.userId, ids[0]))!;
      assert.deepEqual({ ...linked, recurrenceId: original.recurrenceId }, original,
        "nome, valor, data, origem e categoria do fato não são reescritos");
      assert.deepEqual(await loadLedger(owner.userId), ledgerBefore);
      if (source === "import") {
        const [row] = await getDatabase().select({ fingerprint: transactions.fingerprint }).from(transactions).where(eq(transactions.id, ids[0]));
        assert.equal(row.fingerprint, "ofx:original-charge-fixture");
      }
    });
  }

  it("não usa uma compra de outro cartão ou de outro serviço como confirmação", async () => {
    const owner = await ambiente();
    const id = await subscription(owner, { description: "Serviço contratado" });
    const otherCard = await createCard(owner.userId, {
      name: "Outro cartão", kind: "credit", paymentAccountId: owner.contaId,
      closingDay: 13, dueDay: 20, limit: cents(500_000),
    }, NOW);
    await recordTransaction(owner.userId, {
      kind: "expense", description: "Serviço contratado", amount: cents(5_590), cardId: otherCard,
      occurredOn: localDate("2026-11-15"), state: "confirmed",
    }, NOW);
    await recordTransaction(owner.userId, {
      kind: "expense", description: "Outro estabelecimento", amount: cents(5_590), cardId: owner.cartaoId,
      occurredOn: localDate("2026-11-15"), state: "confirmed",
    }, NOW);
    await recordTransaction(owner.userId, {
      kind: "expense", description: "Serviço contratado", amount: cents(5_590), cardId: owner.cartaoId,
      occurredOn: localDate("2026-11-10"), state: "confirmed",
    }, NOW);

    const result = await postDueCardSubscriptions(owner.userId, NOW);
    assert.equal(result.created, 1);
    assert.equal(result.linked, 0);
    const saved = await listTransactions(owner.userId);
    assert.equal(saved.length, 4, "a compra do mesmo serviço fora da janela de três dias também não é vinculada");
    const linked = saved.find((item) => item.recurrenceId === id);
    assert.equal(linked?.source, "recurrence");
    assert.deepEqual(linked?.origin, { kind: "card", cardId: owner.cartaoId });
  });

  it("deixa uma diferença de preço pendente para revisão em vez de duplicar a compra", async () => {
    const owner = await ambiente();
    const id = await subscription(owner);
    await recordTransaction(owner.userId, {
      kind: "expense", description: "Streaming fictício", amount: cents(6_590), cardId: owner.cartaoId,
      occurredOn: localDate("2026-11-15"), state: "confirmed",
    }, NOW);
    const ledgerBefore = await loadLedger(owner.userId);
    const result = await postDueCardSubscriptions(owner.userId, NOW);
    assert.equal(result.created, 0);
    assert.equal(result.linked, 0);
    assert.ok(result.skipped >= 1);
    assert.equal((await listTransactions(owner.userId)).length, 1);
    assert.equal(await confirmedOccurrence(owner.userId, id, competence("2026-11")), null);
    assert.deepEqual(await loadLedger(owner.userId), ledgerBefore);
  });

  it("não escolhe arbitrariamente entre duas compras compatíveis", async () => {
    const owner = await ambiente();
    const id = await subscription(owner);
    for (const date of ["2026-11-14", "2026-11-15"]) {
      await recordTransaction(owner.userId, {
        kind: "expense", description: "Streaming fictício", amount: cents(5_590), cardId: owner.cartaoId,
        occurredOn: localDate(date), state: "confirmed",
      }, NOW);
    }
    const ledgerBefore = await loadLedger(owner.userId);
    const result = await postDueCardSubscriptions(owner.userId, NOW);
    assert.equal(result.created, 0);
    assert.equal(result.linked, 0);
    assert.ok(result.skipped >= 1);
    assert.equal(await confirmedOccurrence(owner.userId, id, competence("2026-11")), null);
    assert.equal((await listTransactions(owner.userId)).length, 2);
    assert.deepEqual(await loadLedger(owner.userId), ledgerBefore);
  });

  it("aguarda a revisão de reajuste já reconhecido pela captura e lança só depois do valor corrigido", async () => {
    const { ingest, buildCapturesView } = await import("./captures.ts");
    const { updateSubscription } = await import("./subscriptions.ts");
    const owner = await ambiente();
    const id = await subscription(owner, { description: "Editor Pro", amountCents: 10_324 });
    const ingested = await ingest(owner.userId, [{
      sourceApp: "com.nu.production", title: "Compra aprovada",
      text: "Compra aprovada: R$ 109,99 em EDITOR PRO",
      postedAt: NOW.getTime(), deviceEventId: "recognized-price-change",
    }], NOW);
    assert.equal(ingested.subscriptions, 1);
    const recognized = (await buildCapturesView(owner.userId, NOW)).recent.find((capture) => capture.status === "assinatura");
    assert.equal(recognized?.amountCents, 10_999);
    const ledgerBefore = await loadLedger(owner.userId);

    const held = await postDueCardSubscriptions(owner.userId, NOW);
    assert.equal(held.created, 0);
    assert.equal(held.linked, 0);
    assert.ok(held.skipped >= 1);
    assert.equal(await confirmedOccurrence(owner.userId, id, competence("2026-11")), null);
    assert.equal((await listTransactions(owner.userId)).length, 0);
    assert.deepEqual(await loadLedger(owner.userId), ledgerBefore, "o preço antigo não vira cobrança real");

    await updateSubscription(owner.userId, id, { amount: cents(10_999) }, NOW);
    const corrected = await postDueCardSubscriptions(owner.userId, NOW);
    assert.equal(corrected.created, 1);
    const saved = await listTransactions(owner.userId);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].amount, 10_999);
    assert.equal(saved[0].recurrenceId, id);
    assert.equal((await postDueCardSubscriptions(owner.userId, NOW)).created, 0);
    assert.equal((await listTransactions(owner.userId)).length, 1);
  });
});

describe("rodízio automático independente da IA", () => {
  it("processa um usuário por tick e alcança os dois sem chamar provedor", async () => {
    const first = await ambiente();
    await subscription(first, { description: "Serviço da primeira pessoa" });
    const { user } = await signUp({
      email: "segunda-assinatura@fluxo.test", password: "senha-ficticia-123", displayName: "Segunda Pessoa",
    });
    const accountId = await createAccount(user.id, { name: "Conta da segunda pessoa", kind: "checking", openingBalance: cents(200_000) }, NOW);
    const cardId = await createCard(user.id, {
      name: "Cartão da segunda pessoa", kind: "credit", paymentAccountId: accountId,
      closingDay: 13, dueDay: 20, limit: cents(500_000),
    }, NOW);
    await createSubscription(user.id, {
      description: "Serviço da segunda pessoa", amount: cents(3_000), scheduleDay: 15,
      startsOn: localDate("2026-11-01"), cardId,
    }, NOW);
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error("Assinaturas não dependem de rede ou IA"); };

    const firstTick = await runScheduledCardSubscriptions(NOW);
    assert.equal(firstTick.processed, 1);
    assert.equal(firstTick.failed, 0);
    assert.equal((await listTransactions(first.userId)).length + (await listTransactions(user.id)).length, 1);
    const secondTick = await runScheduledCardSubscriptions(new Date(NOW.getTime() + 1_000));
    assert.equal(secondTick.processed, 1);
    assert.equal(secondTick.failed, 0);
    assert.equal(firstTick.created + secondTick.created, 2);
    assert.equal((await listTransactions(first.userId)).length, 1);
    assert.equal((await listTransactions(user.id)).length, 1);
    assert.equal(await cachedAnalysis(first.userId), null);
    assert.equal(await cachedAnalysis(user.id), null);
    assert.equal(calls, 0);
  });
});
