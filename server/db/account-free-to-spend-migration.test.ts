import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { it } from "node:test";

const MIGRATIONS = join(import.meta.dirname, "migrations");

it("migra contas existentes preservando a seleção anterior e reenviando o catálogo sem tocar no razão", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("PRAGMA foreign_keys = ON");
    for (const file of readdirSync(MIGRATIONS).filter((name) => /^\d{4}_.+\.sql$/u.test(name) && Number(name.slice(0, 4)) < 30).sort()) {
      database.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
    }

    // A migration is exercised against the actual previous schema, before
    // the new column exists. Service fixtures already use the latest schema.
    const user = database.prepare("INSERT INTO users(id,email,display_name,password_hash,password_salt) VALUES(?,?,?,?,?)");
    user.run("migration-owner", "migration-owner@fluxo.test", "Migration Owner", "fixture-hash", "fixture-salt");
    user.run("migration-other", "migration-other@fluxo.test", "Migration Other", "fixture-hash", "fixture-salt");
    const oldTimestamp = "2000-01-01T00:00:00.000Z";
    const account = database.prepare("INSERT INTO accounts(id,user_id,name,kind,currency,opening_balance_cents,opened_on,include_in_totals,archived_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)");
    const kinds = ["checking", "cash", "benefit", "savings", "investment"];
    kinds.forEach((kind, index) => account.run(`account-${kind}`, "migration-owner", kind, kind, "BRL", (index + 1) * 10_000, "2000-01-01", 1, null, oldTimestamp));
    account.run("account-outside-totals", "migration-owner", "Outside totals", "checking", "BRL", 90_000, "2000-01-01", 0, null, oldTimestamp);
    account.run("account-foreign", "migration-owner", "Foreign", "checking", "USD", 80_000, "2000-01-01", 1, null, oldTimestamp);
    account.run("account-archived", "migration-owner", "Archived", "checking", "BRL", 70_000, "2000-01-01", 1, oldTimestamp, oldTimestamp);
    account.run("account-other-owner", "migration-other", "Other owner", "investment", "BRL", 60_000, "2000-01-01", 1, null, oldTimestamp);
    database.prepare("INSERT INTO transactions(id,user_id,kind,description,amount_cents,occurred_on,competence,origin_account_id) VALUES(?,?,?,?,?,?,?,?)")
      .run("migration-transaction", "migration-owner", "income", "Existing receipt", 12_345, "2000-01-02", "2000-01", "account-checking");
    database.prepare("INSERT INTO ledger_entries(id,user_id,transaction_id,account_id,amount_cents,effective_on,competence,state,kind) VALUES(?,?,?,?,?,?,?,?,?)")
      .run("migration-entry", "migration-owner", "migration-transaction", "account-checking", 12_345, "2000-01-02", "2000-01", "confirmed", "income");

    const rows = (table: string) => database.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
    const beforeUsers = rows("users");
    const beforeAccounts = rows("accounts").map(({ updated_at, ...row }) => { void updated_at; return row; });
    const beforeTransactions = rows("transactions");
    const beforeLedger = rows("ledger_entries");
    const revision = (owner: string) => Number(database.prepare("SELECT revision FROM financial_revisions WHERE user_id = ?").get(owner)?.revision);
    const revisionsBefore = [revision("migration-owner"), revision("migration-other")];

    database.exec(readFileSync(join(MIGRATIONS, "0030_account-free-to-spend.sql"), "utf8"));

    const migrated = rows("accounts");
    assert.deepEqual(migrated.map(({ include_in_free_to_spend, updated_at, ...row }) => {
      void include_in_free_to_spend; void updated_at; return row;
    }), beforeAccounts, "classification, balances, ownership and existing account settings are preserved");
    assert.deepEqual(rows("users"), beforeUsers);
    assert.deepEqual(rows("transactions"), beforeTransactions);
    assert.deepEqual(rows("ledger_entries"), beforeLedger);
    for (const row of migrated) {
      assert.equal(row.include_in_free_to_spend, ["checking", "cash", "benefit"].includes(String(row.kind)) ? 1 : 0);
      assert.match(String(row.updated_at), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
      assert.ok(String(row.updated_at) > oldTimestamp, "existing incremental cursors must receive the new account flag");
    }
    assert.equal(database.prepare("SELECT COUNT(*) AS total FROM accounts WHERE updated_at >= ?").get(oldTimestamp)?.total, migrated.length);
    assert.equal(revision("migration-owner"), revisionsBefore[0] + 8, "the existing account trigger invalidates the owner's financial snapshot");
    assert.equal(revision("migration-other"), revisionsBefore[1] + 1);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(database.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
  } finally {
    database.close();
  }
});
