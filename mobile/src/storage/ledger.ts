/**
 * Leitura e escrita de lançamentos e cadastros no banco do aparelho.
 *
 * Escrever um lançamento é **um** ato atômico: a linha entra na tabela e a
 * mutação entra na fila de saída na mesma transação. Separar os dois abriria a
 * janela em que o usuário vê o lançamento na tela mas ele nunca sobe — o tipo
 * de defeito que só aparece quando o aplicativo morre na hora errada.
 */

import { competenceForPurchase } from "@fluxo/core/domain/card/invoice-cycle.ts";
import { newId } from "@fluxo/core/kernel/id.ts";
import { cents } from "@fluxo/core/kernel/money.ts";
import { competenceOf } from "@fluxo/core/time/competence.ts";
import type { Competence } from "@fluxo/core/time/competence.ts";
import { localDate } from "@fluxo/core/time/local-date.ts";

import { openDatabase } from "./database.ts";
import type {
  LocalAccount,
  LocalCard,
  LocalCategory,
  LocalTransaction,
  TransactionDraft,
} from "./model.ts";
import { SYNC_ENTITY, enqueueStatements } from "./outbox.ts";

type TransactionRow = {
  id: string;
  kind: string;
  state: string;
  description: string;
  categoryId: string | null;
  amountCents: number;
  occurredOn: string;
  competence: string;
  accountId: string | null;
  cardId: string | null;
  destinationAccountId: string | null;
  destinationCardId: string | null;
  tripId: string | null;
  installmentNumber: number | null;
  notes: string | null;
  version: number;
  updatedAt: string;
};

const SELECT_TRANSACTION = `
  SELECT id, kind, state, description, category_id AS categoryId, amount_cents AS amountCents,
         occurred_on AS occurredOn, competence, account_id AS accountId, card_id AS cardId,
         destination_account_id AS destinationAccountId, destination_card_id AS destinationCardId,
         trip_id AS tripId,
         installment_number AS installmentNumber, notes, version, updated_at AS updatedAt
  FROM transactions
  WHERE deleted_at IS NULL
`;

function toTransaction(row: TransactionRow): LocalTransaction {
  return {
    id: row.id,
    kind: row.kind as LocalTransaction["kind"],
    state: row.state as LocalTransaction["state"],
    description: row.description,
    categoryId: row.categoryId,
    amount: cents(row.amountCents),
    occurredOn: localDate(row.occurredOn),
    competence: row.competence as LocalTransaction["competence"],
    accountId: row.accountId,
    cardId: row.cardId,
    destinationAccountId: row.destinationAccountId,
    destinationCardId: row.destinationCardId,
    tripId: row.tripId,
    installmentNumber: row.installmentNumber,
    notes: row.notes,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

export type TransactionQuery = {
  readonly limit?: number;
  readonly from?: string;
  readonly to?: string;
  readonly states?: readonly string[];
};

export async function listTransactions(query: TransactionQuery = {}): Promise<LocalTransaction[]> {
  const database = await openDatabase();

  const condicoes: string[] = [];
  const parametros: (string | number)[] = [];

  if (query.from) {
    condicoes.push("occurred_on >= ?");
    parametros.push(query.from);
  }
  if (query.to) {
    condicoes.push("occurred_on <= ?");
    parametros.push(query.to);
  }
  if (query.states?.length) {
    condicoes.push(`state IN (${query.states.map(() => "?").join(", ")})`);
    parametros.push(...query.states);
  }

  const filtro = condicoes.length ? ` AND ${condicoes.join(" AND ")}` : "";
  const limite = Math.min(Math.max(query.limit ?? 200, 1), 500);
  parametros.push(limite);

  const linhas = await database.getAllAsync<TransactionRow>(
    `${SELECT_TRANSACTION}${filtro} ORDER BY occurred_on DESC, id DESC LIMIT ?`,
    parametros,
  );

  return linhas.map(toTransaction);
}

export async function findTransaction(id: string): Promise<LocalTransaction | null> {
  const database = await openDatabase();
  const linha = await database.getFirstAsync<TransactionRow>(`${SELECT_TRANSACTION} AND id = ?`, [id]);
  return linha ? toTransaction(linha) : null;
}

/**
 * Decide a competência do lançamento.
 *
 * Compra no cartão pertence à **fatura**, não ao mês civil: uma compra em
 * 14/08 num cartão que fecha dia 13 é da fatura de setembro. É a mesma função
 * que o servidor usa — por isso o aparelho pode calcular offline sem risco de
 * mostrar uma coisa e o site mostrar outra.
 *
 * O pagamento de fatura é a exceção: a competência é a da fatura quitada, que
 * o usuário escolhe e costuma ser anterior ao mês do pagamento.
 */
function competenceFor(draft: TransactionDraft, card: LocalCard | null): Competence {
  if (draft.kind === "invoice_payment" && draft.competence) return draft.competence;
  return card ? competenceForPurchase(card, draft.occurredOn) : competenceOf(draft.occurredOn);
}

/** Grava um lançamento novo e enfileira a criação. Devolve o registro local. */
export async function createTransaction(
  draft: TransactionDraft,
  card: LocalCard | null,
  now: Date = new Date(),
): Promise<LocalTransaction> {
  const registro: LocalTransaction = {
    id: newId(now.getTime()),
    kind: draft.kind,
    state: "confirmed",
    description: draft.description,
    categoryId: draft.categoryId,
    amount: draft.amount,
    occurredOn: draft.occurredOn,
    competence: competenceFor(draft, card),
    accountId: draft.accountId,
    cardId: draft.cardId,
    destinationAccountId: draft.destinationAccountId,
    destinationCardId: draft.destinationCardId,
    tripId: null,
    installmentNumber: null,
    notes: draft.notes,
    version: 0,
    updatedAt: now.toISOString(),
  };

  await persist(registro, "upsert", now);
  return registro;
}

/** Reescreve um lançamento existente e enfileira a edição. */
export async function updateTransaction(
  current: LocalTransaction,
  draft: TransactionDraft,
  card: LocalCard | null,
  now: Date = new Date(),
): Promise<LocalTransaction> {
  const registro: LocalTransaction = {
    ...current,
    kind: draft.kind,
    description: draft.description,
    categoryId: draft.categoryId,
    amount: draft.amount,
    occurredOn: draft.occurredOn,
    competence: competenceFor(draft, card),
    accountId: draft.accountId,
    cardId: draft.cardId,
    destinationAccountId: draft.destinationAccountId,
    destinationCardId: draft.destinationCardId,
    notes: draft.notes,
    updatedAt: now.toISOString(),
  };

  await persist(registro, "upsert", now);
  return registro;
}

export async function deleteTransaction(
  current: LocalTransaction,
  now: Date = new Date(),
): Promise<void> {
  await persist(current, "delete", now);
}

async function persist(
  registro: LocalTransaction,
  operation: "upsert" | "delete",
  now: Date,
): Promise<void> {
  const database = await openDatabase();
  const instante = now.toISOString();

  const escrita =
    operation === "delete"
      ? {
          sql: "UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?",
          args: [instante, instante, registro.id] as (string | number | null)[],
        }
      : {
          sql: `INSERT INTO transactions
                  (id, kind, state, description, category_id, amount_cents, occurred_on, competence,
                   account_id, card_id, destination_account_id, destination_card_id, trip_id,
                   installment_number, notes, version, deleted_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
                ON CONFLICT(id) DO UPDATE SET
                  kind = excluded.kind, state = excluded.state, description = excluded.description,
                  category_id = excluded.category_id, amount_cents = excluded.amount_cents,
                  occurred_on = excluded.occurred_on, competence = excluded.competence,
                  account_id = excluded.account_id, card_id = excluded.card_id,
                  destination_account_id = excluded.destination_account_id,
                  destination_card_id = excluded.destination_card_id,
                  notes = excluded.notes, updated_at = excluded.updated_at`,
          args: [
            registro.id,
            registro.kind,
            registro.state,
            registro.description,
            registro.categoryId,
            registro.amount,
            registro.occurredOn,
            registro.competence,
            registro.accountId,
            registro.cardId,
            registro.destinationAccountId,
            registro.destinationCardId,
            registro.tripId,
            registro.installmentNumber,
            registro.notes,
            registro.version,
            registro.updatedAt,
          ] as (string | number | null)[],
        };

  const fila = enqueueStatements({
    mutationId: newId(now.getTime()),
    entityId: registro.id,
    operation,
    baseVersion: registro.version,
    data: operation === "delete" ? null : wireShape(registro),
    now,
  });

  await database.withExclusiveTransactionAsync(async (transacao) => {
    await transacao.runAsync(escrita.sql, escrita.args);
    for (const comando of fila) await transacao.runAsync(comando.sql, comando.args);
  });
}

/** O que sobe na mutação: só o que `writeTransaction` do servidor consome. */
function wireShape(registro: LocalTransaction): Record<string, unknown> {
  return {
    id: registro.id,
    kind: registro.kind,
    state: registro.state,
    description: registro.description,
    categoryId: registro.categoryId,
    amountCents: registro.amount,
    occurredOn: registro.occurredOn,
    accountId: registro.accountId,
    cardId: registro.cardId,
    destinationAccountId: registro.destinationAccountId,
    destinationCardId: registro.destinationCardId,
    // Só o pagamento de fatura declara competência: nos demais o servidor a
    // deriva com a mesma regra que este aparelho usou.
    ...(registro.kind === "invoice_payment" ? { competence: registro.competence } : {}),
    tripId: registro.tripId,
    notes: registro.notes,
  };
}

// --- cadastros --------------------------------------------------------------

export async function listAccounts(): Promise<LocalAccount[]> {
  const database = await openDatabase();
  const linhas = await database.getAllAsync<Omit<LocalAccount, "openingBalance"> & { openingBalanceCents: number }>(
    `SELECT id, name, kind, currency, opening_balance_cents AS openingBalanceCents,
            color, archived_at AS archivedAt
       FROM accounts WHERE archived_at IS NULL ORDER BY name`,
  );
  return linhas.map(({ openingBalanceCents, ...conta }) => ({
    ...conta,
    openingBalance: cents(openingBalanceCents),
  }));
}

export async function listCategories(): Promise<LocalCategory[]> {
  const database = await openDatabase();
  return database.getAllAsync<LocalCategory>(
    `SELECT id, name, kind, color, archived_at AS archivedAt
       FROM categories WHERE archived_at IS NULL ORDER BY name`,
  );
}

export async function listCards(): Promise<LocalCard[]> {
  const database = await openDatabase();
  const linhas = await database.getAllAsync<
    Omit<LocalCard, "limit" | "dueAdjustment"> & { limitCents: number; dueAdjustment: string }
  >(
    `SELECT id, name, kind, closing_day AS closingDay, due_day AS dueDay,
            due_adjustment AS dueAdjustment, limit_cents AS limitCents, color,
            archived_at AS archivedAt
       FROM cards WHERE archived_at IS NULL ORDER BY name`,
  );

  return linhas.map(({ limitCents, dueAdjustment, ...cartao }) => ({
    ...cartao,
    limit: cents(limitCents),
    // A coluna é texto; o domínio só conhece dois valores. Estreitar aqui
    // evita que um dado estranho chegue a `dueDateFor` como se fosse válido.
    dueAdjustment: dueAdjustment === "previous" ? "previous" : "next",
  }));
}

/** Aplica no banco local o que veio do servidor. Ver `src/net/sync.ts`. */
export async function applyServerChanges(
  changes: readonly Record<string, unknown>[],
): Promise<void> {
  if (!changes.length) return;
  const database = await openDatabase();

  await database.withExclusiveTransactionAsync(async (transacao) => {
    for (const mudanca of changes) {
      const id = String(mudanca.id ?? "");
      if (!id) continue;

      // Exclusão vinda do servidor: o registro sai da vista do aparelho, mas
      // a linha continua marcada para que uma mutação antiga da fila não a
      // ressuscite como criação.
      if (mudanca.deletedAt) {
        await transacao.runAsync(
          `INSERT INTO transactions
             (id, kind, state, description, amount_cents, occurred_on, competence, version, deleted_at, updated_at)
           VALUES (?, 'expense', 'confirmed', '', 0, '1970-01-01', '1970-01', ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             deleted_at = excluded.deleted_at, version = excluded.version, updated_at = excluded.updated_at`,
          [
            id,
            Number(mudanca.version ?? 0),
            String(mudanca.deletedAt),
            String(mudanca.updatedAt ?? new Date().toISOString()),
          ],
        );
        continue;
      }

      await transacao.runAsync(
        `INSERT INTO transactions
           (id, kind, state, description, category_id, amount_cents, occurred_on, competence,
            account_id, card_id, destination_account_id, destination_card_id, trip_id,
            installment_number, notes, version, deleted_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind, state = excluded.state, description = excluded.description,
           category_id = excluded.category_id, amount_cents = excluded.amount_cents,
           occurred_on = excluded.occurred_on, competence = excluded.competence,
           account_id = excluded.account_id, card_id = excluded.card_id,
           destination_account_id = excluded.destination_account_id,
           destination_card_id = excluded.destination_card_id, trip_id = excluded.trip_id,
           installment_number = excluded.installment_number, notes = excluded.notes,
           version = excluded.version, deleted_at = NULL, updated_at = excluded.updated_at`,
        [
          id,
          String(mudanca.kind ?? "expense"),
          String(mudanca.state ?? "confirmed"),
          String(mudanca.description ?? ""),
          (mudanca.categoryId as string | null) ?? null,
          Number(mudanca.amountCents ?? 0),
          String(mudanca.occurredOn ?? "1970-01-01"),
          String(mudanca.competence ?? "1970-01"),
          (mudanca.accountId as string | null) ?? null,
          (mudanca.cardId as string | null) ?? null,
          (mudanca.destinationAccountId as string | null) ?? null,
          (mudanca.destinationCardId as string | null) ?? null,
          (mudanca.tripId as string | null) ?? null,
          (mudanca.installmentNumber as number | null) ?? null,
          (mudanca.notes as string | null) ?? null,
          Number(mudanca.version ?? 0),
          String(mudanca.updatedAt ?? new Date().toISOString()),
        ],
      );
    }
  });
}

/** Substitui os cadastros pelo que o servidor mandou. */
export async function applyServerCatalog(catalog: {
  accounts: readonly Record<string, unknown>[];
  categories: readonly Record<string, unknown>[];
  cards: readonly Record<string, unknown>[];
}): Promise<void> {
  const database = await openDatabase();

  await database.withExclusiveTransactionAsync(async (transacao) => {
    for (const conta of catalog.accounts) {
      await transacao.runAsync(
        `INSERT INTO accounts (id, name, kind, currency, opening_balance_cents, color, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, kind = excluded.kind, currency = excluded.currency,
           opening_balance_cents = excluded.opening_balance_cents,
           color = excluded.color, archived_at = excluded.archived_at`,
        [
          String(conta.id),
          String(conta.name ?? ""),
          String(conta.kind ?? "checking"),
          String(conta.currency ?? "BRL"),
          Number(conta.openingBalanceCents ?? 0),
          (conta.color as string | null) ?? null,
          (conta.archivedAt as string | null) ?? null,
        ],
      );
    }

    for (const categoria of catalog.categories) {
      await transacao.runAsync(
        `INSERT INTO categories (id, name, kind, color, archived_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, kind = excluded.kind, color = excluded.color,
           archived_at = excluded.archived_at`,
        [
          String(categoria.id),
          String(categoria.name ?? ""),
          String(categoria.kind ?? "expense"),
          (categoria.color as string | null) ?? null,
          (categoria.archivedAt as string | null) ?? null,
        ],
      );
    }

    for (const cartao of catalog.cards) {
      await transacao.runAsync(
        `INSERT INTO cards
           (id, name, kind, closing_day, due_day, due_adjustment, limit_cents, color, archived_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, kind = excluded.kind, closing_day = excluded.closing_day,
           due_day = excluded.due_day, due_adjustment = excluded.due_adjustment,
           limit_cents = excluded.limit_cents,
           color = excluded.color, archived_at = excluded.archived_at`,
        [
          String(cartao.id),
          String(cartao.name ?? ""),
          String(cartao.kind ?? "credit"),
          Number(cartao.closingDay ?? 1),
          Number(cartao.dueDay ?? 10),
          cartao.dueAdjustment === "previous" ? "previous" : "next",
          Number(cartao.limitCents ?? 0),
          (cartao.color as string | null) ?? null,
          (cartao.archivedAt as string | null) ?? null,
        ],
      );
    }
  });
}
