import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { listAccounts } from "../repositories/catalog.ts";
import { ambiente, zerar } from "../testing/cenario.ts";
import { env } from "../testing/worker-env.ts";
import { createAccount } from "./catalog.ts";
import { buildDashboard } from "./dashboard.ts";
import { memoFinancialRead, withFinancialReadScope } from "./financial-read-scope.ts";
import { buildHealthView } from "./health.ts";
import { recordTransaction } from "./transactions.ts";

const NOW = new Date("2026-10-27T15:00:00Z");

/** Count executions through the same Drizzle/D1 boundary, without logging SQL values. */
async function countQueries<T>(work: () => Promise<T>) {
  const binding = env.DB as { prepare(query: string): object };
  const original = binding.prepare;
  let count = 0;
  const statements: string[] = [];
  const wrap = (statement: object, query: string): object => new Proxy(statement, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function") return value;
      if (property === "bind") return (...args: unknown[]) => wrap(Reflect.apply(value, target, args), query);
      return (...args: unknown[]) => {
        if (["all", "first", "raw", "run"].includes(String(property))) { count++; statements.push(query); }
        return Reflect.apply(value, target, args);
      };
    },
  });
  binding.prepare = (query) => wrap(original.call(binding, query), query);
  try { return { value: await work(), count: () => count, statements }; }
  finally { binding.prepare = original; }
}

describe("explicit financial read scope", () => {
  beforeEach(() => zerar());

  it("shares one in-flight load across nested concurrent consumers", async () => {
    let calls = 0;
    const load = async () => ({ call: ++calls });
    const result = await withFinancialReadScope(() => Promise.all([
      memoFinancialRead("same-user-read", load),
      withFinancialReadScope(() => memoFinancialRead("same-user-read", load)),
    ]));
    assert.equal(calls, 1);
    assert.equal(result[0], result[1], "mapping and query both execute once");
  });

  it("does not retain results outside a scope or across overlapping scopes", async () => {
    let calls = 0;
    const load = async () => ++calls;
    await memoFinancialRead("read", load);
    await memoFinancialRead("read", load);
    assert.equal(calls, 2);
    const results = await Promise.all([
      withFinancialReadScope(() => memoFinancialRead("read", load)),
      withFinancialReadScope(() => memoFinancialRead("read", load)),
    ]);
    assert.deepEqual(results, [3, 4], "two requests must not share even an identical key");
    assert.equal(await withFinancialReadScope(() => memoFinancialRead("read", load)), 5);
  });

  it("allows a failed loader to retry within its scope", async () => {
    let calls = 0;
    await withFinancialReadScope(async () => {
      const load = async () => {
        if (++calls === 1) throw new Error("unavailable");
        return "recovered";
      };
      await assert.rejects(memoFinancialRead("retry", load), /unavailable/);
      assert.equal(await memoFinancialRead("retry", load), "recovered");
    });
    assert.equal(calls, 2);
  });

  it("isolates repository reads by user and query options, and sees later writes", async () => {
    const user = await ambiente();
    await withFinancialReadScope(async () => {
      const [mine, other, includingArchived] = await Promise.all([
        listAccounts(user.userId), listAccounts("different-user"),
        listAccounts(user.userId, { includeArchived: true }),
      ]);
      assert.equal(mine.length, 1);
      assert.deepEqual(other, []);
      assert.notEqual(mine, includingArchived, "different arguments have separate loads");
    });
    await createAccount(user.userId, {
      name: "New account", kind: "checking", openingBalance: cents(1_000),
      openedOn: localDate("2026-10-27"),
    });
    assert.equal((await withFinancialReadScope(() => listAccounts(user.userId))).length, 2);
  });

  it("reduces dashboard plus health from 24 queries to 15 with identical financial outputs", async () => {
    const user = await ambiente();
    await recordTransaction(user.userId, {
      kind: "expense", amount: cents(12_345), description: "Recorded purchase",
      accountId: user.contaId, categoryId: user.categoriaId,
      occurredOn: localDate("2026-10-26"), state: "confirmed",
    }, NOW);
    const views = () => Promise.all([buildDashboard(user.userId, NOW), buildHealthView(user.userId, NOW)]);
    const before = await countQueries(views);
    const after = await countQueries(() => withFinancialReadScope(views));
    assert.equal(before.count(), 24);
    assert.equal(after.count(), 15);
    assert.deepEqual(after.value, before.value, "no amount, invoice, reserve or projection may change");
  });

  it("financial-only consumers preserve every financial field without recent or project queries", async () => {
    const user = await ambiente();
    await recordTransaction(user.userId, {
      kind: "expense", amount: cents(9_876), description: "Card purchase",
      cardId: user.cartaoId, categoryId: user.categoriaId,
      occurredOn: localDate("2026-10-26"), state: "confirmed",
    }, NOW);
    const full = await buildDashboard(user.userId, NOW);
    const light = await countQueries(() => buildDashboard(user.userId, NOW, { financialOnly: true }));
    assert.equal(full.recentTransactions.length, 1, "the default dashboard still has its transaction feed");
    assert.deepEqual(light.value, { ...full, recentTransactions: [], openProjects: [], openTasks: [] });
    assert.equal(light.count(), 9, "financial-only skips exactly six unrelated SQL executions");
    assert.ok(light.statements.every((query) => !/\b(?:projects|clients|project_payments|time_entries|project_tasks)\b/u.test(query)));
  });
});
