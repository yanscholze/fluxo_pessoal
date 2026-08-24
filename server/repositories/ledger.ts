/**
 * Repositório do razão: lançamentos e movimentações.
 *
 * Escrever um lançamento é sempre **apagar as movimentações antigas e gravar
 * as novas**, num lote atômico. Nunca "corrigir o saldo" — o saldo é derivado,
 * então não existe nada para corrigir.
 */

import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { postTransaction } from "../../core/domain/ledger/posting.ts";
import type { LedgerEntry, Transaction } from "../../core/domain/ledger/types.ts";
import { newId } from "../../core/kernel/id.ts";
import type { LocalDate } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { ledgerEntries, transactions } from "../db/schema/index.ts";
import { partyColumns, toLedgerEntry, toTransaction } from "./mappers.ts";

/**
 * Carrega o razão inteiro do usuário.
 *
 * Aplicação pessoal: um usuário intenso acumula na casa das dezenas de
 * milhares de movimentações em anos, o que o D1 devolve confortavelmente. A
 * alternativa — agregar em SQL — obrigaria a reimplementar em SQL as regras
 * que já existem em `core/domain/ledger`, e duas implementações divergem. Se
 * algum dia isso passar de ~50 mil linhas, o caminho é paginar por janela com
 * um saldo de arrasto, não duplicar a regra.
 */
export async function loadLedger(userId: string): Promise<LedgerEntry[]> {
  const database = getDatabase();
  const rows = await database.select().from(ledgerEntries).where(eq(ledgerEntries.userId, userId));
  return rows.map(toLedgerEntry);
}

export type TransactionMeta = {
  readonly categoryId: string | null;
  readonly description: string;
  readonly kind: Transaction["kind"];
};

/**
 * Índice leve dos lançamentos vivos.
 *
 * As movimentações do razão não carregam descrição nem categoria — elas falam
 * de dinheiro, não de significado. Quem precisa rotular uma movimentação
 * consulta este índice pelo `transactionId`.
 */
export async function transactionIndex(userId: string): Promise<Map<string, TransactionMeta>> {
  const database = getDatabase();
  const rows = await database
    .select({
      id: transactions.id,
      categoryId: transactions.categoryId,
      description: transactions.description,
      kind: transactions.kind,
    })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)));

  return new Map(
    rows.map((row) => [row.id, { categoryId: row.categoryId, description: row.description, kind: row.kind }]),
  );
}

/** Recorte do índice com apenas a categoria, no formato que o domínio espera. */
export function categoriesFrom(index: ReadonlyMap<string, TransactionMeta>): Map<string, string | null> {
  return new Map([...index].map(([id, meta]) => [id, meta.categoryId]));
}

export type TransactionQuery = {
  readonly from?: LocalDate;
  readonly to?: LocalDate;
  readonly limit?: number;
  /** Recorta por situação. Omitido, traz tudo que não foi excluído. */
  readonly states?: readonly Transaction["state"][];
};

export async function listTransactions(userId: string, query: TransactionQuery = {}): Promise<Transaction[]> {
  const database = getDatabase();
  const filters = [eq(transactions.userId, userId), isNull(transactions.deletedAt)];
  if (query.from) filters.push(gte(transactions.occurredOn, query.from));
  if (query.to) filters.push(lte(transactions.occurredOn, query.to));
  if (query.states?.length) filters.push(inArray(transactions.state, [...query.states]));

  const rows = await database
    .select()
    .from(transactions)
    .where(and(...filters))
    .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt))
    .limit(query.limit ?? 500);

  return rows.map(toTransaction);
}

export async function findTransaction(userId: string, transactionId: string): Promise<Transaction | null> {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, transactionId)))
    .limit(1);

  return row && !row.deletedAt ? toTransaction(row) : null;
}

export async function currentVersion(userId: string, transactionId: string): Promise<number | null> {
  const database = getDatabase();
  const [row] = await database
    .select({ version: transactions.version })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, transactionId)))
    .limit(1);

  return row?.version ?? null;
}

export type PersistOptions = {
  readonly fingerprint?: string | null;
  readonly invoiceId?: string | null;
  readonly recurrenceId?: string | null;
  readonly deviceId?: string | null;
  readonly mutationId?: string | null;
  readonly version?: number;
  /**
   * Recompensa apurada no momento da compra, congelada junto com o lançamento.
   * Recalcular depois faria o extrato do mês passado mudar quando o dólar
   * mexesse.
   */
  readonly reward?: {
    readonly pointsMilli: number;
    readonly cashbackCents: number;
    readonly usdRateMicros: number;
  } | null;
};

/**
 * Grava um lançamento junto com as movimentações que ele causa.
 *
 * As duas coisas vão no mesmo lote: um lançamento sem as suas movimentações
 * seria dinheiro que não existe no razão, e movimentações sem lançamento
 * seriam dinheiro sem origem.
 */
export async function saveTransaction(transaction: Transaction, options: PersistOptions = {}): Promise<void> {
  const database = getDatabase();
  await database.batch(buildSaveStatements(transaction, options) as never);
}

/**
 * Grava vários lançamentos atomicamente.
 *
 * Um parcelamento de 12x são 12 lançamentos: ou entram todos, ou nenhum. Um
 * laço de gravações individuais deixaria o plano pela metade se a quinta
 * falhasse, e o usuário veria uma compra que não fecha com as parcelas.
 */
export async function saveTransactionBatch(
  entries: readonly { transaction: Transaction; options?: PersistOptions }[],
): Promise<void> {
  if (!entries.length) return;
  const database = getDatabase();
  const statements = entries.flatMap((entry) => buildSaveStatements(entry.transaction, entry.options ?? {}));
  await database.batch(statements as never);
}

function buildSaveStatements(transaction: Transaction, options: PersistOptions) {
  const database = getDatabase();
  const now = new Date().toISOString();

  const origin = partyColumns(transaction.origin);
  const destination = partyColumns(transaction.destination);

  const values = {
    id: transaction.id,
    userId: transaction.userId,
    kind: transaction.kind,
    state: transaction.state,
    source: transaction.source,
    description: transaction.description,
    categoryId: transaction.categoryId,
    amountCents: transaction.amount as number,
    currency: transaction.currency,
    occurredOn: transaction.occurredOn as string,
    competence: transaction.competence as string,
    originAccountId: origin.accountId,
    originCardId: origin.cardId,
    destinationAccountId: destination.accountId,
    destinationCardId: destination.cardId,
    tripId: transaction.tripId,
    installmentPlanId: transaction.installmentPlanId,
    installmentNumber: transaction.installmentNumber,
    invoiceId: options.invoiceId ?? null,
    recurrenceId: options.recurrenceId ?? transaction.recurrenceId ?? null,
    rewardPointsMilli: options.reward?.pointsMilli ?? null,
    rewardCashbackCents: options.reward?.cashbackCents ?? null,
    rewardUsdRateMicros: options.reward?.usdRateMicros ?? null,
    notes: transaction.notes,
    fingerprint: options.fingerprint ?? null,
    version: options.version ?? 1,
    deletedAt: null,
    lastMutationId: options.mutationId ?? null,
    deviceId: options.deviceId ?? null,
    updatedAt: now,
  };

  const entries = postTransaction(transaction).map((draft) => {
    const party = partyColumns(draft.party);
    return {
      id: newId(),
      userId: draft.userId,
      transactionId: draft.transactionId,
      accountId: party.accountId,
      cardId: party.cardId,
      amountCents: draft.amount as number,
      effectiveOn: draft.effectiveOn as string,
      competence: draft.competence as string,
      state: draft.state,
      kind: draft.kind,
    };
  });

  return [
    database
      .insert(transactions)
      .values(values)
      .onConflictDoUpdate({ target: transactions.id, set: { ...values, id: undefined } }),
    // Movimentações são imutáveis: editar é apagar e regerar.
    database.delete(ledgerEntries).where(eq(ledgerEntries.transactionId, transaction.id)),
    ...(entries.length ? [database.insert(ledgerEntries).values(entries)] : []),
  ];
}

/**
 * Exclusão lógica.
 *
 * As movimentações são removidas de fato — dinheiro que não conta não deve
 * ficar no razão esperando que todo `SELECT` lembre de filtrá-lo. O lançamento
 * permanece marcado para que a sincronização propague a exclusão aos outros
 * dispositivos.
 */
export async function softDeleteTransaction(
  userId: string,
  transactionId: string,
  options: { deviceId?: string | null; mutationId?: string | null } = {},
): Promise<boolean> {
  const database = getDatabase();
  const now = new Date().toISOString();

  const [existing] = await database
    .select({ version: transactions.version, deletedAt: transactions.deletedAt })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, transactionId)))
    .limit(1);

  if (!existing || existing.deletedAt) return false;

  await database.batch([
    database
      .update(transactions)
      .set({
        deletedAt: now,
        updatedAt: now,
        version: sql`${transactions.version} + 1`,
        deviceId: options.deviceId ?? null,
        lastMutationId: options.mutationId ?? null,
        // Libera a impressão digital para uma reimportação futura.
        fingerprint: null,
      })
      .where(and(eq(transactions.userId, userId), eq(transactions.id, transactionId))),
    database.delete(ledgerEntries).where(eq(ledgerEntries.transactionId, transactionId)),
  ] as never);

  return true;
}
