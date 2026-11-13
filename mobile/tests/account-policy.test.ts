import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { after, describe, it } from "node:test";

import { cents } from "@fluxo/core/kernel/money.ts";
import { competence } from "@fluxo/core/time/competence.ts";
import { localDate } from "@fluxo/core/time/local-date.ts";
import { overview } from "../src/finance/derive.ts";
import type { LocalTransaction } from "../src/storage/model.ts";

// Exercise the real storage/migration code against SQLite, replacing only the
// Expo native bridge. Existing local transactions and pending work survive.
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
  INSERT INTO _migrations VALUES (0, 'esquema-inicial', '2026-10-01'), (1, 'campos-do-livre-para-gastar', '2026-10-01');
  CREATE TABLE accounts (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'BRL',
    opening_balance_cents INTEGER NOT NULL DEFAULT 0, include_in_totals INTEGER NOT NULL DEFAULT 1,
    color TEXT, archived_at TEXT
  );
  INSERT INTO accounts (id, name, kind, opening_balance_cents) VALUES
    ('old-checking', 'Corrente', 'checking', 1000), ('old-cash', 'Dinheiro', 'cash', 2000),
    ('old-benefit', 'Vale', 'benefit', 3000), ('old-savings', 'Poupança', 'savings', 4000),
    ('old-investment', 'Investimento', 'investment', 5000);
  CREATE TABLE transactions (id TEXT PRIMARY KEY, description TEXT);
  INSERT INTO transactions VALUES ('existing-transaction', 'Movimento existente');
  CREATE TABLE outbox (mutation_id TEXT PRIMARY KEY, data_json TEXT);
  INSERT INTO outbox VALUES ('pending-offline-work', '{"amount":123}');
`);

const adapter = {
  async execAsync(sql: string) { sqlite.exec(sql); },
  async runAsync(sql: string, args: SQLInputValue[] = []) { return sqlite.prepare(sql).run(...args); },
  async getAllAsync(sql: string, args: SQLInputValue[] = []) { return sqlite.prepare(sql).all(...args); },
  async getFirstAsync(sql: string, args: SQLInputValue[] = []) { return sqlite.prepare(sql).get(...args) ?? null; },
  async withExclusiveTransactionAsync(work: (transaction: {
    runAsync: (sql: string, args?: SQLInputValue[]) => Promise<unknown>;
  }) => Promise<void>) {
    sqlite.exec("BEGIN");
    try { await work(adapter); sqlite.exec("COMMIT"); }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  },
};
const runtime = globalThis as typeof globalThis & { __fluxoAccountPolicySqlite?: typeof adapter };
runtime.__fluxoAccountPolicySqlite = adapter;
const nativeBridge = registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "expo-sqlite"
      ? { url: "fluxo-test:account-policy-sqlite", shortCircuit: true }
      : nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    return url === "fluxo-test:account-policy-sqlite"
      ? { format: "module", source: "export const openDatabaseAsync = async () => globalThis.__fluxoAccountPolicySqlite;", shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { openDatabase } = await import("../src/storage/database.ts");
const { applyServerCatalog, listAccounts } = await import("../src/storage/ledger.ts");

after(() => {
  nativeBridge.deregister();
  delete runtime.__fluxoAccountPolicySqlite;
  sqlite.close();
});

describe("participação das contas no Livre no aparelho", () => {
  it("migra uma instalação anterior sem alterar o resultado ou perder a fila offline", async () => {
    await openDatabase();
    const accounts = await listAccounts();
    const selected = new Map(accounts.map((account) => [account.id, account.includeInFreeToSpend]));
    assert.deepEqual([...selected].sort(), [
      ["old-benefit", true], ["old-cash", true], ["old-checking", true],
      ["old-investment", false], ["old-savings", false],
    ]);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM _migrations WHERE id = 2").get()?.n, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM transactions").get()?.n, 1);
    assert.equal(sqlite.prepare("SELECT data_json FROM outbox WHERE mutation_id = ?").get("pending-offline-work")?.data_json, '{"amount":123}');
  });

  it("sincroniza escolhas explícitas independentemente do tipo e tolera servidor antigo", async () => {
    await applyServerCatalog({
      accounts: [
        { id: "included-investment", name: "Investimento disponível", kind: "investment", openingBalanceCents: 100_000, includeInFreeToSpend: true },
        { id: "excluded-checking", name: "Corrente reservada", kind: "checking", openingBalanceCents: 900_000, includeInFreeToSpend: false },
        { id: "legacy-checking", name: "Corrente antiga", kind: "checking" },
        { id: "legacy-investment", name: "Investimento antigo", kind: "investment" },
        { id: "globally-excluded", name: "Fora dos totais", kind: "investment", includeInTotals: false, includeInFreeToSpend: true },
      ],
      categories: [], cards: [],
    });
    const accounts = new Map((await listAccounts()).map((account) => [account.id, account]));
    assert.equal(accounts.get("included-investment")?.includeInFreeToSpend, true);
    assert.equal(accounts.get("included-investment")?.kind, "investment");
    assert.equal(accounts.get("excluded-checking")?.includeInFreeToSpend, false);
    assert.equal(accounts.get("legacy-checking")?.includeInFreeToSpend, true);
    assert.equal(accounts.get("legacy-investment")?.includeInFreeToSpend, false);
    assert.equal(accounts.get("globally-excluded")?.includeInTotals, false);
    assert.equal(accounts.get("globally-excluded")?.includeInFreeToSpend, true, "a exclusão global não apaga a escolha específica");

    await applyServerCatalog({
      accounts: [{ id: "included-investment", name: "Investimento disponível", kind: "investment", openingBalanceCents: 100_000, includeInFreeToSpend: false }],
      categories: [], cards: [],
    });
    assert.equal((await listAccounts()).find((account) => account.id === "included-investment")?.includeInFreeToSpend, false,
      "atualizar a preferência para false também persiste no SQLite");
  });

  it("usa a preferência sincronizada no domínio, incluindo o saldo e as previsões uma vez", async () => {
    await applyServerCatalog({
      accounts: [{ id: "included-investment", name: "Investimento disponível", kind: "investment", openingBalanceCents: 100_000, includeInFreeToSpend: true }],
      categories: [], cards: [],
    });
    const accounts = (await listAccounts()).filter((account) => ["included-investment", "excluded-checking", "globally-excluded"].includes(account.id));
    const row = (id: string, overrides: Partial<LocalTransaction>): LocalTransaction => ({
      id, kind: "income", state: "planned", description: "Movimento fictício", categoryId: null,
      amount: cents(0), occurredOn: localDate("2026-11-09"), competence: competence("2026-11"),
      accountId: "included-investment", cardId: null, destinationAccountId: null, destinationCardId: null,
      tripId: null, installmentNumber: null, notes: null, version: 1, updatedAt: "2026-11-05T12:00:00Z",
      ...overrides,
    });
    const rows = [
      row("received", { state: "confirmed", occurredOn: localDate("2026-11-02"), amount: cents(12_000) }),
      row("expected", { amount: cents(30_000) }),
      row("expense", { kind: "expense", amount: cents(5_000) }),
      row("excluded-category", { categoryId: "excluded", amount: cents(20_000) }),
      row("excluded-account", { accountId: "excluded-checking", amount: cents(80_000) }),
      row("outside-totals", { accountId: "globally-excluded", amount: cents(90_000) }),
    ];
    const result = overview({
      rows, accounts, cards: [], userId: "fixture", today: localDate("2026-11-05"), competence: competence("2026-11"),
      categories: [{ id: "excluded", name: "Fora da folga", kind: "income", excludeFromFreeToSpend: true, color: null, archivedAt: null }],
    });
    assert.equal(result.freeToSpend.liquidBalance, 112_000);
    assert.equal(result.freeToSpend.pendingIncome, 30_000);
    assert.equal(result.freeToSpend.otherCommitments, 5_000);
    assert.equal(result.free, 137_000);
    assert.equal(accounts.find((account) => account.id === "included-investment")?.kind, "investment");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM transactions").get()?.n, 1, "sincronizar política não gera movimentos");
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM outbox").get()?.n, 1);
  });
});
