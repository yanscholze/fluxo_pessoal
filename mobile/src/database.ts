import type { SQLiteDatabase } from "expo-sqlite";
import { normalizeDashboardLayout, type DashboardWidgetPreference } from "./dashboard";
import { actionForSyncResult, coalescedBaseVersion, shouldRemoveFromOutbox } from "./sync-contract";
import type { FinanceSnapshot, FinanceTransaction, SyncMutation, SyncResponse } from "./types";

const DATABASE_VERSION = 2;
const SNAPSHOT_KEY = "finance-snapshot";
const DASHBOARD_LAYOUT_KEY = "dashboard-layout-v1";
const THEME_KEY = "theme-v1";

type TransactionRow = { id: string; data_json: string; version: number; pending_sync: number; deleted_at: string | null };
type OutboxRow = { mutation_id: string; entity_id: string; operation: "upsert" | "delete"; base_version: number; data_json: string | null };
type AttachmentRow = { entity_id: string; uri: string };

const emptySnapshot = (): FinanceSnapshot => ({
  accounts: [], categories: [], cards: [], trips: [], transactions: [], rewardRedemptions: [], salaryRule: null, benefitRule: null, recurringRules: [], serverTime: new Date(0).toISOString(),
});

export async function migrateDatabase(db: SQLiteDatabase) {
  const version = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  if ((version?.user_version ?? 0) >= DATABASE_VERSION) return;
  if ((version?.user_version ?? 0) < 1) await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_transactions (
      id TEXT PRIMARY KEY NOT NULL,
      data_json TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      pending_sync INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS local_transactions_pending_idx ON local_transactions (pending_sync, updated_at);
    CREATE TABLE IF NOT EXISTS sync_outbox (
      mutation_id TEXT PRIMARY KEY NOT NULL,
      entity_id TEXT NOT NULL UNIQUE,
      operation TEXT NOT NULL,
      base_version INTEGER NOT NULL,
      data_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sync_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mutation_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      server_data_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
  if ((version?.user_version ?? 0) < 2) await db.execAsync(`
    CREATE TABLE IF NOT EXISTS local_attachments (
      entity_id TEXT PRIMARY KEY NOT NULL,
      uri TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'receipt',
      created_at TEXT NOT NULL
    );
  `);
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
}

async function putTransaction(db: SQLiteDatabase, transaction: FinanceTransaction, pendingSync: boolean) {
  const deletedAt = transaction.deletedAt ?? null;
  await db.runAsync(
    `INSERT INTO local_transactions (id, data_json, version, pending_sync, deleted_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, version = excluded.version,
       pending_sync = excluded.pending_sync, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at`,
    transaction.id,
    JSON.stringify({ ...transaction, pendingSync }),
    transaction.version ?? 0,
    pendingSync ? 1 : 0,
    deletedAt,
    transaction.updatedAt ?? new Date().toISOString(),
  );
}

export async function readLocalSnapshot(db: SQLiteDatabase): Promise<FinanceSnapshot> {
  const stored = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", SNAPSHOT_KEY);
  let snapshot = emptySnapshot();
  if (stored?.value) {
    try { snapshot = { ...snapshot, ...JSON.parse(stored.value) }; } catch { snapshot = emptySnapshot(); }
  }
  const rows = await db.getAllAsync<TransactionRow>("SELECT * FROM local_transactions WHERE deleted_at IS NULL ORDER BY updated_at DESC");
  const attachments = await db.getAllAsync<AttachmentRow>("SELECT entity_id, uri FROM local_attachments");
  const receiptById = new Map(attachments.map((item) => [item.entity_id, item.uri]));
  return { ...snapshot, transactions: rows.map((row) => ({ ...JSON.parse(row.data_json), receiptUri: receiptById.get(row.id), pendingSync: Boolean(row.pending_sync) })) };
}

export async function saveLocalAttachment(db: SQLiteDatabase, entityId: string, uri: string) {
  await db.runAsync(
    `INSERT INTO local_attachments (entity_id, uri, kind, created_at) VALUES (?, ?, 'receipt', ?)
     ON CONFLICT(entity_id) DO UPDATE SET uri = excluded.uri`,
    entityId, uri, new Date().toISOString(),
  );
}

export async function readDashboardLayout(db: SQLiteDatabase): Promise<DashboardWidgetPreference[]> {
  const stored = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", DASHBOARD_LAYOUT_KEY);
  try { return normalizeDashboardLayout(stored?.value ? JSON.parse(stored.value) : null); }
  catch { return normalizeDashboardLayout(null); }
}

export async function saveDashboardLayout(db: SQLiteDatabase, layout: DashboardWidgetPreference[]) {
  await db.runAsync(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    DASHBOARD_LAYOUT_KEY, JSON.stringify(normalizeDashboardLayout(layout)),
  );
}

export async function readThemePreference(db: SQLiteDatabase): Promise<"light" | "dark" | null> {
  const stored = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", THEME_KEY);
  return stored?.value === "light" || stored?.value === "dark" ? stored.value : null;
}

export async function saveThemePreference(db: SQLiteDatabase, theme: "light" | "dark") {
  await db.runAsync("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", THEME_KEY, theme);
}

export async function saveLocalTransaction(db: SQLiteDatabase, transaction: FinanceTransaction, mutationId: string) {
  const existing = await db.getFirstAsync<{ version: number }>("SELECT version FROM local_transactions WHERE id = ?", transaction.id);
  const pending = await db.getFirstAsync<OutboxRow>("SELECT * FROM sync_outbox WHERE entity_id = ?", transaction.id);
  const now = new Date().toISOString();
  const baseVersion = coalescedBaseVersion(pending?.base_version ?? null, existing?.version ?? transaction.version ?? 0);
  const saved = { ...transaction, version: existing?.version ?? transaction.version ?? 0, updatedAt: now, deletedAt: undefined, pendingSync: true };
  await db.withExclusiveTransactionAsync(async (txn) => {
    await putTransaction(txn, saved, true);
    await txn.runAsync(
      `INSERT INTO sync_outbox (mutation_id, entity_id, operation, base_version, data_json, created_at, updated_at)
       VALUES (?, ?, 'upsert', ?, ?, ?, ?)
       ON CONFLICT(entity_id) DO UPDATE SET operation = 'upsert', data_json = excluded.data_json, updated_at = excluded.updated_at`,
      pending?.mutation_id ?? mutationId,
      transaction.id,
      baseVersion,
      JSON.stringify(saved),
      now,
      now,
    );
  });
}

export async function deleteLocalTransaction(db: SQLiteDatabase, entityId: string, mutationId: string) {
  const row = await db.getFirstAsync<TransactionRow>("SELECT * FROM local_transactions WHERE id = ?", entityId);
  if (!row) return;
  const pending = await db.getFirstAsync<OutboxRow>("SELECT * FROM sync_outbox WHERE entity_id = ?", entityId);
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (pending?.base_version === 0) {
      await txn.runAsync("DELETE FROM sync_outbox WHERE entity_id = ?", entityId);
      await txn.runAsync("DELETE FROM local_transactions WHERE id = ?", entityId);
      return;
    }
    const now = new Date().toISOString();
    const data = { ...JSON.parse(row.data_json), deletedAt: now, updatedAt: now, pendingSync: true };
    await putTransaction(txn, data, true);
    await txn.runAsync(
      `INSERT INTO sync_outbox (mutation_id, entity_id, operation, base_version, data_json, created_at, updated_at)
       VALUES (?, ?, 'delete', ?, NULL, ?, ?)
       ON CONFLICT(entity_id) DO UPDATE SET operation = 'delete', data_json = NULL, updated_at = excluded.updated_at`,
      pending?.mutation_id ?? mutationId,
      entityId,
      pending?.base_version ?? row.version,
      now,
      now,
    );
  });
}

export async function readOutbox(db: SQLiteDatabase, limit = 50): Promise<SyncMutation[]> {
  const rows = await db.getAllAsync<OutboxRow>("SELECT * FROM sync_outbox ORDER BY created_at LIMIT ?", limit);
  return rows.map((row) => ({
    mutationId: row.mutation_id,
    entity: "transaction",
    entityId: row.entity_id,
    operation: row.operation,
    baseVersion: row.base_version,
    data: row.data_json ? JSON.parse(row.data_json) : undefined,
  }));
}

export async function applySyncResponse(db: SQLiteDatabase, response: SyncResponse) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const result of response.results) {
      const pendingMutation = await txn.getFirstAsync<{ entity_id: string }>("SELECT entity_id FROM sync_outbox WHERE mutation_id = ?", result.mutationId);
      if (shouldRemoveFromOutbox(result)) await txn.runAsync("DELETE FROM sync_outbox WHERE mutation_id = ?", result.mutationId);
      const action = actionForSyncResult(result);
      if (action !== "accept-server") {
        await txn.runAsync(
          "INSERT INTO sync_conflicts (mutation_id, entity_id, status, message, server_data_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
          result.mutationId, result.entityId, result.status, result.message ?? null,
          result.entityData ? JSON.stringify(result.entityData) : null, new Date().toISOString(),
        );
      }
      if (result.entityData?.deletedAt) await txn.runAsync("DELETE FROM local_transactions WHERE id = ?", result.entityId);
      else if (result.entityData) {
        await putTransaction(txn, result.entityData, false);
        if (pendingMutation && pendingMutation.entity_id !== result.entityData.id) {
          await txn.runAsync("DELETE FROM local_transactions WHERE id = ?", pendingMutation.entity_id);
        }
      }
    }

    const pending = await txn.getAllAsync<{ entity_id: string }>("SELECT entity_id FROM sync_outbox");
    const pendingIds = new Set(pending.map((row) => row.entity_id));
    const serverIds = new Set(response.snapshot.transactions.map((transaction) => transaction.id));
    for (const transaction of response.snapshot.transactions) {
      if (!pendingIds.has(transaction.id)) await putTransaction(txn, transaction, false);
    }
    const local = await txn.getAllAsync<{ id: string }>("SELECT id FROM local_transactions WHERE pending_sync = 0");
    for (const row of local) if (!serverIds.has(row.id)) await txn.runAsync("DELETE FROM local_transactions WHERE id = ?", row.id);

    const { transactions: _transactions, ...snapshotWithoutTransactions } = response.snapshot;
    await txn.runAsync(
      "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      SNAPSHOT_KEY,
      JSON.stringify(snapshotWithoutTransactions),
    );
  });
}

export async function pendingCount(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM sync_outbox");
  return row?.count ?? 0;
}

export async function conflictCount(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM sync_conflicts");
  return row?.count ?? 0;
}
