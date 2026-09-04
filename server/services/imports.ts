/**
 * Serviço de importação.
 *
 * O pipeline inteiro, do arquivo ao lançamento:
 *
 * ```
 * arquivo → parser → normalização → duplicidade → transferência →
 * categorização → revisão → confirmação → persistência
 * ```
 *
 * Nada vira lançamento antes da confirmação. Uma linha duplicada ou um
 * pagamento de fatura contado como despesa envenenam todo cálculo daí pra
 * frente, e o usuário não tem como saber de onde veio o número errado.
 */

import { competenceForPurchase } from "../../core/domain/card/invoice-cycle.ts";
import { parseCsv } from "../../core/domain/import/csv-parser.ts";
import { parseOfx } from "../../core/domain/import/ofx-parser.ts";
import { buildReview, normalizeText } from "../../core/domain/import/review.ts";
import { type ImportTarget, type ParseResult, summarize } from "../../core/domain/import/types.ts";
import { accountParty, cardParty, type Transaction } from "../../core/domain/ledger/types.ts";
import { conflict, notFound, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { abs, cents } from "../../core/kernel/money.ts";
import { type Competence, competenceOf } from "../../core/time/competence.ts";
import { type LocalDate, localDate } from "../../core/time/local-date.ts";
import { and, asc, eq } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import { categorizationRules, importBatches, importItems, transactions } from "../db/schema/index.ts";
import { findAccount, findCard, listAccounts } from "../repositories/catalog.ts";
import { ensureInvoices } from "../repositories/invoices.ts";
import { saveTransactionBatch } from "../repositories/ledger.ts";

export type StartImportInput = {
  readonly filename: string;
  readonly content: string;
  readonly accountId?: string | null;
  readonly cardId?: string | null;
  readonly competence?: Competence | null;
};

export type BatchSummary = {
  readonly id: string;
  readonly filename: string;
  readonly format: "ofx" | "csv";
  readonly status: "review" | "committed" | "discarded";
  readonly targetName: string;
  readonly competence: Competence | null;
  readonly createdAt: string;
  readonly counts: {
    readonly found: number;
    readonly fresh: number;
    readonly duplicates: number;
    readonly withoutCategory: number;
    readonly possibleTransfers: number;
    readonly discarded: number;
  };
};

export type ReviewItemView = {
  readonly id: string;
  readonly occurredOn: LocalDate;
  readonly description: string;
  readonly amountCents: number;
  readonly kind: "expense" | "income";
  readonly verdict: "novo" | "duplicado" | "possivel_transferencia" | "sem_categoria";
  readonly categoryId: string | null;
  readonly installment: { current: number; total: number } | null;
  readonly decision: "pendente" | "aceitar" | "ignorar";
  readonly rawText: string;
};

/** Detecta o formato pelo conteúdo, não pela extensão — que o usuário renomeia. */
function detectFormat(content: string): "ofx" | "csv" {
  return /<(OFX|STMTTRN|CCSTMTTRN)\b/i.test(content) ? "ofx" : "csv";
}

export async function startImport(
  userId: string,
  input: StartImportInput,
  now: Date = new Date(),
): Promise<BatchSummary> {
  const target = await resolveTarget(userId, input);
  const format = detectFormat(input.content);
  const parsed: ParseResult = format === "ofx" ? parseOfx(input.content) : parseCsv(input.content);

  // Sem nenhuma linha legível não há o que revisar, e um lote vazio é um beco
  // sem saída: a tela abre a revisão, não mostra nada e não oferece ação. O
  // arquivo pode até ter conteúdo — cabeçalho, rodapé, texto solto —, mas se
  // nada virou lançamento, o problema é o arquivo, e dizer isso na hora do
  // envio é a única resposta útil.
  if (!parsed.rows.length) {
    throw validationError("Não foi possível ler nenhum lançamento neste arquivo", [
      { path: "file", message: "Envie um extrato em OFX ou CSV" },
    ]);
  }

  const database = getDatabase();
  const [accounts, rules, known] = await Promise.all([
    listAccounts(userId),
    database.select().from(categorizationRules).where(eq(categorizationRules.userId, userId)),
    knownFingerprints(userId),
  ]);

  const items = buildReview(parsed, {
    target,
    knownFingerprints: known,
    categoryRules: rules.map((rule) => ({ match: rule.matchText, categoryId: rule.categoryId })),
    accounts: accounts.map((account) => ({ id: account.id, name: account.name })),
  });

  const counts = summarize(items, parsed.discarded);
  const batchId = newId(now.getTime());

  await database.insert(importBatches).values({
    id: batchId,
    userId,
    filename: input.filename.slice(0, 200),
    format,
    targetAccountId: target.kind === "account" ? target.accountId : null,
    targetCardId: target.kind === "card" ? target.cardId : null,
    competence: target.kind === "card" ? target.competence : null,
    status: "review",
    foundCount: counts.found,
    freshCount: counts.fresh,
    duplicateCount: counts.duplicates,
    withoutCategoryCount: counts.withoutCategory,
    possibleTransferCount: counts.possibleTransfers,
    discardedCount: counts.discarded,
  });

  if (items.length) {
    // O índice único por `(batch, fingerprint)` recusa duas linhas idênticas
    // dentro do mesmo arquivo — acontece quando o banco exporta o período
    // sobreposto duas vezes.
    await database
      .insert(importItems)
      .values(
        items.map((item, index) => ({
          id: newId(now.getTime() + index),
          batchId,
          userId,
          rawText: item.row.rawText.slice(0, 1000),
          externalId: item.row.externalId,
          occurredOn: item.row.date as string,
          description: item.row.description,
          amountCents: item.row.amount as number,
          installmentCurrent: item.row.installment?.current ?? null,
          installmentTotal: item.row.installment?.total ?? null,
          fingerprint: item.fingerprint,
          verdict: item.verdict,
          categoryId: item.suggestedCategoryId,
          transferCounterpartId: item.transferCounterpartId,
          // Duplicada já entra marcada para ignorar: o padrão seguro é não
          // gravar de novo, e o usuário pode reverter linha a linha.
          decision: item.verdict === "duplicado" ? ("ignorar" as const) : ("pendente" as const),
          sortOrder: index,
        })),
      )
      .onConflictDoNothing();
  }

  return (await findBatch(userId, batchId))!.batch;
}

async function resolveTarget(userId: string, input: StartImportInput): Promise<ImportTarget> {
  if (input.cardId && input.accountId) {
    throw validationError("Escolha a conta ou o cartão, não os dois", [
      { path: "cardId", message: "Escolha apenas um destino" },
    ]);
  }

  if (input.cardId) {
    const card = await findCard(userId, input.cardId);
    if (!card) throw notFound("Cartão", input.cardId);
    if (!input.competence) {
      throw validationError("Informe a competência da fatura", [
        { path: "competence", message: "Selecione a fatura que o arquivo representa" },
      ]);
    }
    return { kind: "card", cardId: card.id, competence: input.competence };
  }

  if (!input.accountId) {
    throw validationError("Informe o destino da importação", [
      { path: "accountId", message: "Selecione a conta ou o cartão" },
    ]);
  }

  const account = await findAccount(userId, input.accountId);
  if (!account) throw notFound("Conta", input.accountId);
  return { kind: "account", accountId: account.id };
}

/** Impressões digitais já conhecidas, para o veredito de duplicidade. */
async function knownFingerprints(userId: string): Promise<Set<string>> {
  const database = getDatabase();
  const rows = await database
    .select({ fingerprint: transactions.fingerprint })
    .from(transactions)
    .where(eq(transactions.userId, userId));

  return new Set(rows.map((row) => row.fingerprint).filter((value): value is string => Boolean(value)));
}

export async function listBatches(userId: string): Promise<BatchSummary[]> {
  const database = getDatabase();
  const [rows, accounts] = await Promise.all([
    database.select().from(importBatches).where(eq(importBatches.userId, userId)),
    listAccounts(userId),
  ]);
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));

  return rows
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((row) => toBatchSummary(row, accountName));
}

function toBatchSummary(
  row: typeof importBatches.$inferSelect,
  accountName: ReadonlyMap<string, string>,
): BatchSummary {
  return {
    id: row.id,
    filename: row.filename,
    format: row.format,
    status: row.status,
    targetName: row.targetAccountId
      ? (accountName.get(row.targetAccountId) ?? "Conta removida")
      : "Cartão",
    competence: (row.competence as Competence | null) ?? null,
    createdAt: row.createdAt,
    counts: {
      found: row.foundCount,
      fresh: row.freshCount,
      duplicates: row.duplicateCount,
      withoutCategory: row.withoutCategoryCount,
      possibleTransfers: row.possibleTransferCount,
      discarded: row.discardedCount,
    },
  };
}

export async function findBatch(
  userId: string,
  batchId: string,
): Promise<{ batch: BatchSummary; items: ReviewItemView[] } | null> {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.userId, userId), eq(importBatches.id, batchId)))
    .limit(1);
  if (!row) return null;

  const [items, accounts] = await Promise.all([
    database
      .select()
      .from(importItems)
      .where(eq(importItems.batchId, batchId))
      .orderBy(asc(importItems.sortOrder)),
    listAccounts(userId),
  ]);

  return {
    batch: toBatchSummary(row, new Map(accounts.map((account) => [account.id, account.name]))),
    items: items.map((item) => ({
      id: item.id,
      occurredOn: localDate(item.occurredOn),
      description: item.description,
      amountCents: item.amountCents,
      kind: item.amountCents < 0 ? ("expense" as const) : ("income" as const),
      verdict: item.verdict,
      categoryId: item.categoryId,
      installment:
        item.installmentCurrent && item.installmentTotal
          ? { current: item.installmentCurrent, total: item.installmentTotal }
          : null,
      decision: item.decision,
      rawText: item.rawText,
    })),
  };
}

export async function decideItem(
  userId: string,
  itemId: string,
  input: { decision?: "pendente" | "aceitar" | "ignorar"; categoryId?: string | null },
): Promise<void> {
  const database = getDatabase();
  const [item] = await database
    .select()
    .from(importItems)
    .where(and(eq(importItems.userId, userId), eq(importItems.id, itemId)))
    .limit(1);
  if (!item) throw notFound("Linha da importação", itemId);

  await database
    .update(importItems)
    .set({
      ...(input.decision ? { decision: input.decision } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    })
    .where(and(eq(importItems.userId, userId), eq(importItems.id, itemId)));

  // Categorizar à mão ensina o sistema: da próxima vez o mesmo estabelecimento
  // já chega categorizado.
  if (input.categoryId) {
    await learnRule(userId, item.description, input.categoryId);
  }
}

/** Aceita todas as linhas ainda pendentes de uma vez. */
export async function acceptAllPending(userId: string, batchId: string): Promise<number> {
  const database = getDatabase();
  const pendentes = await database
    .select({ id: importItems.id })
    .from(importItems)
    .where(and(eq(importItems.userId, userId), eq(importItems.batchId, batchId), eq(importItems.decision, "pendente")));

  if (!pendentes.length) return 0;

  await database
    .update(importItems)
    .set({ decision: "aceitar" })
    .where(and(eq(importItems.userId, userId), eq(importItems.batchId, batchId), eq(importItems.decision, "pendente")));

  return pendentes.length;
}

async function learnRule(userId: string, description: string, categoryId: string): Promise<void> {
  const match = normalizeText(description).slice(0, 60);
  if (match.length < 4) return; // texto curto demais casaria com qualquer coisa

  await getDatabase()
    .insert(categorizationRules)
    .values({ id: newId(), userId, matchText: match, categoryId, hitCount: 1 })
    .onConflictDoUpdate({
      target: [categorizationRules.userId, categorizationRules.matchText],
      set: { categoryId },
    });
}

/**
 * Confirma o lote: as linhas aceitas viram lançamentos.
 *
 * A impressão digital vai junto no lançamento — é ela que faz a próxima
 * importação do mesmo período reconhecer o que já entrou.
 */
export async function commitBatch(
  userId: string,
  batchId: string,
  now: Date = new Date(),
): Promise<{ created: number; skipped: number }> {
  const database = getDatabase();
  const found = await findBatch(userId, batchId);
  if (!found) throw notFound("Lote de importação", batchId);
  if (found.batch.status !== "review") {
    throw conflict("Este lote já foi finalizado", { status: found.batch.status });
  }

  const [row] = await database
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.userId, userId), eq(importBatches.id, batchId)))
    .limit(1);

  const aceitas = found.items.filter((item) => item.decision === "aceitar");
  if (!aceitas.length) {
    await database
      .update(importBatches)
      .set({ status: "committed", committedAt: now.toISOString() })
      .where(and(eq(importBatches.userId, userId), eq(importBatches.id, batchId)));
    return { created: 0, skipped: found.items.length };
  }

  const card = row.targetCardId ? await findCard(userId, row.targetCardId) : null;
  const fingerprintById = new Map(
    (
      await database
        .select({ id: importItems.id, fingerprint: importItems.fingerprint })
        .from(importItems)
        .where(eq(importItems.batchId, batchId))
    ).map((item) => [item.id, item.fingerprint]),
  );

  const competences = new Set<Competence>();
  const lote = aceitas.map((item) => {
    const competence = card
      ? competenceForPurchase(card, item.occurredOn)
      : competenceOf(item.occurredOn);
    if (card) competences.add(competence);

    const transaction: Transaction = {
      id: newId(now.getTime()),
      userId,
      kind: item.kind,
      state: "confirmed",
      source: "import",
      description: item.description,
      categoryId: item.categoryId,
      amount: abs(cents(item.amountCents)),
      currency: "BRL",
      occurredOn: item.occurredOn,
      origin: card ? cardParty(card.id) : accountParty(row.targetAccountId as string),
      destination: null,
      competence,
      tripId: null,
      installmentPlanId: null,
      installmentNumber: item.installment?.current ?? null,
      recurrenceId: null,
      notes: null,
    };

    return {
      transaction,
      options: { fingerprint: fingerprintById.get(item.id) ?? null, deviceId: "import" },
      itemId: item.id,
    };
  });

  if (card && competences.size) {
    await ensureInvoices({ userId, cardId: card.id, cycle: card, competences: [...competences] });
  }

  await saveTransactionBatch(lote.map(({ transaction, options }) => ({ transaction, options })));

  await database.batch([
    ...lote.map(({ itemId, transaction }) =>
      database.update(importItems).set({ transactionId: transaction.id }).where(eq(importItems.id, itemId)),
    ),
    database
      .update(importBatches)
      .set({ status: "committed", committedAt: now.toISOString() })
      .where(and(eq(importBatches.userId, userId), eq(importBatches.id, batchId))),
  ] as never);

  return { created: lote.length, skipped: found.items.length - lote.length };
}

export async function discardBatch(userId: string, batchId: string): Promise<void> {
  await getDatabase()
    .update(importBatches)
    .set({ status: "discarded" })
    .where(and(eq(importBatches.userId, userId), eq(importBatches.id, batchId)));
}
