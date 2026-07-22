import { env } from "cloudflare:workers";
import { and, eq, or } from "drizzle-orm";
import { accounts, cards, syncMutations, transactions, trips } from "../../../../db/schema";
import { ensureFinanceSchema } from "../../../../db/ensure-schema";
import { getDb } from "../../../../db";
import { apiIdentityFrom, apiUnauthorized } from "../../../../lib/api-v1-auth";
import type { FinanceTransaction, PaymentMethod, TransactionType } from "../../../../lib/finance-types";
import { importFingerprintCandidates, scopedImportFingerprint } from "../../../../lib/import-fingerprint";
import { cleanInstallmentDescription } from "../../../../lib/import-parser";
import { effectiveRecurringDate } from "../../../../lib/brazil-calendar";
import { decideSyncMutation, parseSyncRequestV1, SYNC_API_VERSION, SYNC_SCHEMA_VERSION, type SyncMutationResultV1 } from "../../../../lib/sync-v1";
import { financeGetForOwner } from "../../finance/route";

type TransactionRow = typeof transactions.$inferSelect;

function transactionJson(row: TransactionRow): FinanceTransaction {
  return {
    id: row.id,
    description: row.installments ? cleanInstallmentDescription(row.description) : row.description,
    category: row.category,
    account: row.account,
    destinationAccount: row.destinationAccount ?? undefined,
    date: row.occurredAt,
    amount: row.amountCents / 100,
    type: row.type as TransactionType,
    paymentMethod: row.paymentMethod as PaymentMethod,
    cardId: row.cardId ?? undefined,
    tripId: row.tripId ?? undefined,
    invoiceMonth: row.invoiceMonth ?? undefined,
    installments: row.installments ?? undefined,
    installmentGroupId: row.installmentGroupId ?? undefined,
    importBatchId: row.importBatchId ?? undefined,
    importBatchName: row.importBatchName ?? undefined,
    importBatchMonth: row.importBatchMonth ?? undefined,
    importedAt: row.importedAt ?? undefined,
    status: row.status === "planned" ? "planned" : "confirmed",
    source: row.source as FinanceTransaction["source"],
    fingerprint: row.fingerprint ?? undefined,
    rewardPoints: row.rewardPointsMilli == null ? undefined : row.rewardPointsMilli / 1000,
    rewardCashback: row.rewardCashbackCents == null ? undefined : row.rewardCashbackCents / 100,
    rewardUsdRate: row.rewardUsdRateMicros == null ? undefined : row.rewardUsdRateMicros / 1_000_000,
    version: row.version,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt ?? undefined,
    deviceId: row.deviceId ?? undefined,
  };
}

function balanceEffect(item: { type: string; status: string; paymentMethod: string; amountCents: number; deletedAt?: string | null }) {
  if (item.deletedAt || item.status !== "confirmed" || !["debit", "cash", "transfer"].includes(item.paymentMethod)) return 0;
  return item.type === "income" ? item.amountCents : -item.amountCents;
}

function accountDeltas(item: { account: string; destinationAccount?: string | null; source?: string | null; type: string; status: string; paymentMethod: string; amountCents: number; deletedAt?: string | null }, multiplier = 1) {
  const deltas = new Map<string, number>();
  const sourceDelta = balanceEffect(item) * multiplier;
  if (sourceDelta) deltas.set(item.account, sourceDelta);
  if (!item.deletedAt && item.status === "confirmed" && item.source === "account-transfer" && item.destinationAccount) deltas.set(item.destinationAccount, (deltas.get(item.destinationAccount) ?? 0) + item.amountCents * multiplier);
  return deltas;
}

function validTransaction(item: FinanceTransaction | undefined) {
  return Boolean(
    item?.id && item.description?.trim() && item.account?.trim() && item.category?.trim()
    && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
    && Number.isFinite(item.amount) && item.amount > 0
    && ["income", "expense", "transfer"].includes(item.type),
  );
}

function receiptId(ownerId: string, mutationId: string) {
  return `${ownerId}:${mutationId}`;
}

function receiptStatement(ownerId: string, deviceId: string, result: SyncMutationResultV1, operation: string) {
  return env.DB.prepare(`INSERT INTO sync_mutations
    (id, owner_id, mutation_id, device_id, entity_type, entity_id, operation, status, response_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_id, mutation_id) DO NOTHING`)
    .bind(receiptId(ownerId, result.mutationId), ownerId, result.mutationId, deviceId, result.entity, result.entityId, operation, result.status, JSON.stringify(result));
}

async function rememberResult(ownerId: string, deviceId: string, result: SyncMutationResultV1, operation: string) {
  await receiptStatement(ownerId, deviceId, result, operation).run();
  return result;
}

async function snapshotFor(request: Request, ownerId: string) {
  const response = await financeGetForOwner(request, ownerId);
  if (!response.ok) throw new Error("Não foi possível montar o estado financeiro");
  return response.json();
}

function monthOffset(month: string, offset: number) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function purchaseInvoiceMonth(date: string, closingDay: number) {
  const calendarMonth = date.slice(0, 7);
  const closingDate = effectiveRecurringDate(calendarMonth, closingDay, "day-of-month", "previous");
  return date > closingDate ? monthOffset(calendarMonth, 1) : calendarMonth;
}

function syncResponse(snapshot: unknown, results: SyncMutationResultV1[] = []) {
  const serverTime = new Date().toISOString();
  return Response.json({
    apiVersion: SYNC_API_VERSION,
    schemaVersion: SYNC_SCHEMA_VERSION,
    syncMode: "full-snapshot-with-outbox",
    syncToken: serverTime,
    serverTime,
    results,
    snapshot,
  }, { headers: { "cache-control": "no-store", "x-fluxo-api-version": SYNC_API_VERSION } });
}

export async function GET(request: Request) {
  try {
    await ensureFinanceSchema();
    const identity = await apiIdentityFrom(request);
    if (!identity) return apiUnauthorized();
    return syncResponse(await snapshotFor(request, identity.ownerId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha na sincronização" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await ensureFinanceSchema();
    const identity = await apiIdentityFrom(request);
    if (!identity) return apiUnauthorized();
    const ownerId = identity.ownerId;
    const parsed = parseSyncRequestV1(await request.json());
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400, headers: { "x-fluxo-api-version": SYNC_API_VERSION } });
    await snapshotFor(request, ownerId);
    const db = getDb();
    const results: SyncMutationResultV1[] = [];

    for (const mutation of parsed.value.mutations) {
      const cached = (await db.select().from(syncMutations).where(and(eq(syncMutations.ownerId, ownerId), eq(syncMutations.mutationId, mutation.mutationId))).limit(1))[0];
      if (cached) {
        const original = JSON.parse(cached.responseJson) as SyncMutationResultV1;
        results.push({ ...original, status: "duplicate", message: "Alteração já processada anteriormente" });
        continue;
      }

      const existing = (await db.select().from(transactions).where(and(eq(transactions.ownerId, ownerId), eq(transactions.id, mutation.entityId))).limit(1))[0];
      if (!existing) {
        const idOwner = (await db.select({ ownerId: transactions.ownerId }).from(transactions).where(eq(transactions.id, mutation.entityId)).limit(1))[0];
        if (idOwner && idOwner.ownerId !== ownerId) {
          results.push(await rememberResult(ownerId, parsed.value.device.id, {
            mutationId: mutation.mutationId, entity: "transaction", entityId: mutation.entityId,
            status: "rejected", message: "Identificador de lançamento indisponível",
          }, mutation.operation));
          continue;
        }
      }
      if (existing?.lastMutationId === mutation.mutationId) {
        results.push(await rememberResult(ownerId, parsed.value.device.id, {
          mutationId: mutation.mutationId, entity: "transaction", entityId: existing.id,
          status: "duplicate", entityVersion: existing.version, entityData: transactionJson(existing),
        }, mutation.operation));
        continue;
      }

      const decision = decideSyncMutation(existing?.version ?? null, mutation.baseVersion, mutation.operation, Boolean(existing?.deletedAt));
      if (decision.status === "conflict") {
        results.push(await rememberResult(ownerId, parsed.value.device.id, {
          mutationId: mutation.mutationId, entity: "transaction", entityId: mutation.entityId,
          status: "conflict", entityVersion: decision.currentVersion,
          entityData: existing ? transactionJson(existing) : undefined,
          message: "O lançamento foi alterado em outro dispositivo",
        }, mutation.operation));
        continue;
      }
      if (decision.status === "noop") {
        results.push(await rememberResult(ownerId, parsed.value.device.id, {
          mutationId: mutation.mutationId, entity: "transaction", entityId: mutation.entityId,
          status: "noop", entityVersion: decision.currentVersion,
          entityData: existing ? transactionJson(existing) : undefined,
        }, mutation.operation));
        continue;
      }

      const now = new Date().toISOString();
      if (mutation.operation === "delete") {
        const deletedData = { ...transactionJson(existing!), version: decision.nextVersion, deletedAt: now, updatedAt: now, deviceId: parsed.value.device.id };
        const statements = [
          env.DB.prepare(`UPDATE transactions SET deleted_at = ?, version = ?, device_id = ?, last_mutation_id = ?, updated_at = ? WHERE owner_id = ? AND id = ?`)
            .bind(now, decision.nextVersion, parsed.value.device.id, mutation.mutationId, now, ownerId, mutation.entityId),
        ];
        for (const [account, delta] of accountDeltas(existing!, -1)) if (delta) statements.push(env.DB.prepare(`UPDATE accounts SET balance_cents = balance_cents + ?, updated_at = ? WHERE owner_id = ? AND name = ? AND kind <> 'credit-card'`).bind(delta, now, ownerId, account));
        const result: SyncMutationResultV1 = { mutationId: mutation.mutationId, entity: "transaction", entityId: mutation.entityId, status: "applied", entityVersion: decision.nextVersion, entityData: deletedData };
        statements.push(receiptStatement(ownerId, parsed.value.device.id, result, mutation.operation));
        await env.DB.batch(statements);
        results.push(result);
        continue;
      }

      const item = mutation.data;
      if (!validTransaction(item)) {
        results.push(await rememberResult(ownerId, parsed.value.device.id, {
          mutationId: mutation.mutationId, entity: "transaction", entityId: mutation.entityId,
          status: "rejected", message: "Lançamento inválido",
        }, mutation.operation));
        continue;
      }

      const importFingerprint = scopedImportFingerprint(item!);
      if (!existing && item!.source === "import" && importFingerprint) {
        const aliases = importFingerprintCandidates(item!);
        const duplicate = (await db.select().from(transactions).where(and(eq(transactions.ownerId, ownerId), or(...aliases.map((fingerprint) => eq(transactions.fingerprint, fingerprint))))).limit(1))[0];
        if (duplicate && !duplicate.deletedAt) {
          results.push(await rememberResult(ownerId, parsed.value.device.id, {
            mutationId: mutation.mutationId, entity: "transaction", entityId: duplicate.id,
            status: "duplicate", entityVersion: duplicate.version, entityData: transactionJson(duplicate),
            message: "Este lançamento importado já existe",
          }, mutation.operation));
          continue;
        }
      }

      let paymentMethod = (["credit", "debit", "cash", "transfer"].includes(item!.paymentMethod ?? "") ? item!.paymentMethod : "other") as PaymentMethod;
      let source = (["import", "recurring", "invoice-payment"].includes(item!.source ?? "") ? item!.source : "manual") as NonNullable<FinanceTransaction["source"]>;
      let resolvedAccount = item!.account.trim();
      let resolvedDestinationAccount: string | null = null;
      let resolvedCardId = item!.cardId?.trim() || null;
      const requestedTripId = item!.tripId?.trim() || null;
      const resolvedTripId = requestedTripId ? (await db.select({ id: trips.id }).from(trips).where(and(eq(trips.ownerId, ownerId), eq(trips.id, requestedTripId))).limit(1))[0]?.id ?? null : null;
      if (requestedTripId && !resolvedTripId) {
        results.push(await rememberResult(ownerId, parsed.value.device.id, {
          mutationId: mutation.mutationId, entity: "transaction", entityId: mutation.entityId,
          status: "rejected", message: "A viagem selecionada não pertence a esta conta",
        }, mutation.operation));
        continue;
      }
      let resolvedInvoiceMonth = /^\d{4}-\d{2}$/.test(item!.invoiceMonth ?? "") ? item!.invoiceMonth! : null;
      if (item!.type === "expense" && (paymentMethod === "credit" || resolvedCardId)) {
        const ownerCards = await db.select().from(cards).where(eq(cards.ownerId, ownerId));
        const selectedCard = ownerCards.find((card) => card.id === resolvedCardId)
          ?? ownerCards.find((card) => card.linkedAccount === resolvedAccount && card.kind === paymentMethod)
          ?? (paymentMethod === "credit" && ownerCards.filter((card) => card.kind === "credit").length === 1 ? ownerCards.find((card) => card.kind === "credit") : undefined);
        if (paymentMethod === "credit" && (!selectedCard || selectedCard.kind !== "credit")) {
          results.push(await rememberResult(ownerId, parsed.value.device.id, {
            mutationId: mutation.mutationId, entity: "transaction", entityId: mutation.entityId,
            status: "rejected", message: "Selecione o cartão de crédito usado na compra",
          }, mutation.operation));
          continue;
        }
        if (selectedCard) {
          resolvedAccount = selectedCard.linkedAccount;
          resolvedCardId = selectedCard.id;
          resolvedInvoiceMonth = selectedCard.kind === "credit" ? resolvedInvoiceMonth ?? purchaseInvoiceMonth(item!.date, selectedCard.closingDay) : null;
        }
      }
      if (item!.type === "transfer") {
        paymentMethod = "transfer";
        source = "account-transfer";
        resolvedCardId = null;
        resolvedInvoiceMonth = null;
        resolvedDestinationAccount = item!.destinationAccount?.trim() || null;
        const ownerAccounts = await db.select().from(accounts).where(eq(accounts.ownerId, ownerId));
        const validSource = ownerAccounts.some((account) => account.name === resolvedAccount && account.kind !== "credit-card");
        const validDestination = ownerAccounts.some((account) => account.name === resolvedDestinationAccount && account.kind !== "credit-card");
        if (!validSource || !validDestination || resolvedAccount === resolvedDestinationAccount) {
          results.push(await rememberResult(ownerId, parsed.value.device.id, {
            mutationId: mutation.mutationId, entity: "transaction", entityId: mutation.entityId,
            status: "rejected", message: "Selecione contas de origem e destino diferentes",
          }, mutation.operation));
          continue;
        }
      }
      const values = {
        description: source === "import" ? cleanInstallmentDescription(item!.description) : item!.description.trim(), category: item!.type === "transfer" ? "Transferência" : item!.category.trim(), account: resolvedAccount, destinationAccount: resolvedDestinationAccount, occurredAt: item!.date,
        amountCents: Math.round(item!.amount * 100), type: item!.type, paymentMethod,
        cardId: resolvedCardId, tripId: resolvedTripId, invoiceMonth: resolvedInvoiceMonth,
        installments: item!.installments?.trim() || null,
        installmentGroupId: item!.installments?.trim() ? item!.installmentGroupId?.trim().slice(0, 160) || existing?.installmentGroupId || item!.id.replace(/-\d+$/, "") : null,
        importBatchId: source === "import" ? item!.importBatchId?.trim().slice(0, 160) || existing?.importBatchId || null : null,
        importBatchName: source === "import" ? item!.importBatchName?.trim().slice(0, 180) || existing?.importBatchName || null : null,
        importBatchMonth: source === "import" && /^\d{4}-\d{2}$/.test(item!.importBatchMonth?.trim() || "") ? item!.importBatchMonth!.trim() : existing?.importBatchMonth ?? null,
        importedAt: source === "import" ? item!.importedAt?.trim().slice(0, 40) || existing?.importedAt || now : null,
        status: (item!.status === "planned" ? "planned" : "confirmed") as "planned" | "confirmed", source,
        fingerprint: importFingerprint || null,
        rewardPointsMilli: item!.rewardPoints == null ? existing?.rewardPointsMilli ?? null : Math.round(Math.max(0, item!.rewardPoints) * 1000),
        rewardCashbackCents: item!.rewardCashback == null ? existing?.rewardCashbackCents ?? null : Math.round(Math.max(0, item!.rewardCashback) * 100),
        rewardUsdRateMicros: item!.rewardUsdRate == null ? existing?.rewardUsdRateMicros ?? null : Math.round(Math.max(0, item!.rewardUsdRate) * 1_000_000),
      };
      const savedData: FinanceTransaction = {
        id: mutation.entityId, description: values.description, category: values.category, account: values.account, destinationAccount: values.destinationAccount ?? undefined,
        date: values.occurredAt, amount: values.amountCents / 100, type: values.type, paymentMethod: values.paymentMethod,
        cardId: values.cardId ?? undefined, tripId: values.tripId ?? undefined, invoiceMonth: values.invoiceMonth ?? undefined, installments: values.installments ?? undefined, installmentGroupId: values.installmentGroupId ?? undefined,
        importBatchId: values.importBatchId ?? undefined, importBatchName: values.importBatchName ?? undefined, importBatchMonth: values.importBatchMonth ?? undefined, importedAt: values.importedAt ?? undefined,
        status: values.status, source: values.source, fingerprint: values.fingerprint ?? undefined,
        rewardPoints: values.rewardPointsMilli == null ? undefined : values.rewardPointsMilli / 1000,
        rewardCashback: values.rewardCashbackCents == null ? undefined : values.rewardCashbackCents / 100,
        rewardUsdRate: values.rewardUsdRateMicros == null ? undefined : values.rewardUsdRateMicros / 1_000_000,
        version: decision.nextVersion, updatedAt: now, deviceId: parsed.value.device.id,
      };
      const result: SyncMutationResultV1 = { mutationId: mutation.mutationId, entity: "transaction", entityId: mutation.entityId, status: "applied", entityVersion: decision.nextVersion, entityData: savedData };
      const write = existing
        ? env.DB.prepare(`UPDATE transactions SET description = ?, category = ?, account = ?, destination_account = ?, occurred_at = ?, amount_cents = ?, type = ?, installments = ?, installment_group_id = ?, import_batch_id = ?, import_batch_name = ?, import_batch_month = ?, imported_at = ?, status = ?, source = ?, payment_method = ?, card_id = ?, trip_id = ?, invoice_month = ?, reward_points_milli = ?, reward_cashback_cents = ?, reward_usd_rate_micros = ?, fingerprint = ?, version = ?, deleted_at = NULL, device_id = ?, last_mutation_id = ?, updated_at = ? WHERE owner_id = ? AND id = ?`)
          .bind(values.description, values.category, values.account, values.destinationAccount, values.occurredAt, values.amountCents, values.type, values.installments, values.installmentGroupId, values.importBatchId, values.importBatchName, values.importBatchMonth, values.importedAt, values.status, values.source, values.paymentMethod, values.cardId, values.tripId, values.invoiceMonth, values.rewardPointsMilli, values.rewardCashbackCents, values.rewardUsdRateMicros, values.fingerprint, decision.nextVersion, parsed.value.device.id, mutation.mutationId, now, ownerId, mutation.entityId)
        : env.DB.prepare(`INSERT INTO transactions (id, owner_id, description, category, account, destination_account, occurred_at, amount_cents, type, installments, installment_group_id, import_batch_id, import_batch_name, import_batch_month, imported_at, status, source, payment_method, card_id, trip_id, invoice_month, reward_points_milli, reward_cashback_cents, reward_usd_rate_micros, fingerprint, version, deleted_at, device_id, last_mutation_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`)
          .bind(mutation.entityId, ownerId, values.description, values.category, values.account, values.destinationAccount, values.occurredAt, values.amountCents, values.type, values.installments, values.installmentGroupId, values.importBatchId, values.importBatchName, values.importBatchMonth, values.importedAt, values.status, values.source, values.paymentMethod, values.cardId, values.tripId, values.invoiceMonth, values.rewardPointsMilli, values.rewardCashbackCents, values.rewardUsdRateMicros, values.fingerprint, decision.nextVersion, parsed.value.device.id, mutation.mutationId, now);
      const statements = [write];
      const deltas = new Map<string, number>();
      if (existing) for (const [account, delta] of accountDeltas(existing, -1)) deltas.set(account, (deltas.get(account) ?? 0) + delta);
      for (const [account, delta] of accountDeltas({ ...values, deletedAt: null })) deltas.set(account, (deltas.get(account) ?? 0) + delta);
      for (const [account, delta] of deltas) if (delta) statements.push(env.DB.prepare(`UPDATE accounts SET balance_cents = balance_cents + ?, updated_at = ? WHERE owner_id = ? AND name = ? AND kind <> 'credit-card'`).bind(delta, now, ownerId, account));
      statements.push(receiptStatement(ownerId, parsed.value.device.id, result, mutation.operation));
      await env.DB.batch(statements);
      results.push(result);
    }

    return syncResponse(await snapshotFor(request, ownerId), results);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha na sincronização" }, { status: 500, headers: { "x-fluxo-api-version": SYNC_API_VERSION } });
  }
}
