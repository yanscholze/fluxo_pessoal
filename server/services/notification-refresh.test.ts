import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";
import { loadLedger } from "../repositories/ledger.ts";
import { financialRevision } from "../repositories/ai.ts";
import { refreshEssentialNotifications } from "./notification-refresh.ts";
import { recordTransaction } from "./transactions.ts";

const NOW = new Date("2026-10-27T12:00:00Z");
beforeEach(zerar);

test("essential refresh checkpoints revision/day, skips unchanged work and preserves ledger", async () => {
  const user = await ambiente();
  const before = await loadLedger(user.userId);
  assert.equal(await refreshEssentialNotifications(user.userId, NOW), true);
  assert.equal(await refreshEssentialNotifications(user.userId, NOW), false);
  assert.deepEqual(await loadLedger(user.userId), before);
  const revision = await financialRevision(user.userId);
  await recordTransaction(user.userId, { kind: "expense", state: "confirmed", description: "Despesa de teste", amount: cents(2000),
    accountId: user.contaId, categoryId: user.categoriaId, occurredOn: localDate("2026-10-27") }, NOW);
  assert.ok(await financialRevision(user.userId) > revision);
  const changed = await loadLedger(user.userId);
  assert.equal(await refreshEssentialNotifications(user.userId, NOW), true);
  assert.equal(await refreshEssentialNotifications(user.userId, NOW), false);
  assert.equal(await refreshEssentialNotifications(user.userId, new Date("2026-10-28T12:00:00Z")), true);
  assert.deepEqual(await loadLedger(user.userId), changed);
});

test("concurrent essential refreshes share a durable lease and need no provider", async () => {
  const user = await ambiente();
  const outcomes = await Promise.all([refreshEssentialNotifications(user.userId, NOW), refreshEssentialNotifications(user.userId, NOW)]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.equal(await refreshEssentialNotifications(user.userId, NOW), false);
});
