/**
 * Serviço de sincronização.
 *
 * Recebe o lote de mutações do aparelho, aplica o que dá, e devolve o que
 * mudou desde o cursor. A resposta é incremental: a versão anterior mandava o
 * snapshot inteiro a cada sincronização, o que ficava caro conforme o
 * histórico crescia e desperdiçava dados do usuário.
 */

import { competenceForPurchase } from "../../core/domain/card/invoice-cycle.ts";
import { accountParty, cardParty, type Party, type Transaction } from "../../core/domain/ledger/types.ts";
import {
  type Mutation,
  type MutationResult,
  type SyncCursor,
  type SyncRequest,
  type SyncResponse,
  SYNC_PROTOCOL_VERSION,
  assertValidRequest,
  decide,
} from "../../core/domain/sync/protocol.ts";
import { isDomainError, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { cents, parseMoney } from "../../core/kernel/money.ts";
import { competenceOf, parseCompetence } from "../../core/time/competence.ts";
import { parseLocalDate, todayIn } from "../../core/time/local-date.ts";
import { and, asc, eq, gt, gte, or, sql } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import { accounts, cards, categories, syncMutations, transactions } from "../db/schema/index.ts";
import { findAccount, findCard } from "../repositories/catalog.ts";
import { ensureInvoices } from "../repositories/invoices.ts";
import { saveTransactionBatch, softDeleteTransaction } from "../repositories/ledger.ts";
import { earningForPurchase } from "./rewards.ts";

/** Quantos registros o servidor devolve por página. */
const PAGE_SIZE = 200;

export async function synchronize(
  userId: string,
  request: SyncRequest,
  now: Date = new Date(),
): Promise<SyncResponse> {
  assertValidRequest(request);

  const results: MutationResult[] = [];
  for (const mutation of request.mutations) {
    results.push(await applyMutation(userId, request.device.id, mutation, now));
  }

  const { changes, cursor, hasMore } = await pullChanges(userId, request.cursor ?? null);

  return {
    protocolVersion: SYNC_PROTOCOL_VERSION,
    results,
    changes,
    cursor,
    hasMore,
    catalog: await pullCatalog(userId, request.cursor ?? null),
    serverTime: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

async function applyMutation(
  userId: string,
  deviceId: string,
  mutation: Mutation,
  now: Date,
): Promise<MutationResult> {
  const database = getDatabase();

  // O recibo vem primeiro: se esta mutação já foi processada, devolvemos a
  // resposta original em vez de gravar de novo.
  const [recibo] = await database
    .select({ resultJson: syncMutations.resultJson })
    .from(syncMutations)
    .where(and(eq(syncMutations.userId, userId), eq(syncMutations.mutationId, mutation.mutationId)))
    .limit(1);

  if (recibo) {
    const original = JSON.parse(recibo.resultJson) as MutationResult;
    return { ...original, status: "duplicate" };
  }

  const [atual] = await database
    .select({
      version: transactions.version,
      deletedAt: transactions.deletedAt,
      userId: transactions.userId,
    })
    .from(transactions)
    .where(eq(transactions.id, mutation.entityId))
    .limit(1);

  // Identificador de outro dono: o aparelho gerou um ULID que colidiu, ou
  // alguém está tentando escrever onde não deve. Nos dois casos, recusa.
  if (atual && atual.userId !== userId) {
    return record(userId, deviceId, mutation, {
      mutationId: mutation.mutationId,
      entityId: mutation.entityId,
      status: "rejected",
      message: "Identificador indisponível",
    }, now);
  }

  const decisao = decide(mutation, atual?.version ?? null, Boolean(atual?.deletedAt));

  if (decisao.action === "noop") {
    return record(userId, deviceId, mutation, {
      mutationId: mutation.mutationId,
      entityId: mutation.entityId,
      status: "noop",
    }, now);
  }

  if (decisao.action === "conflict") {
    // O conflito **não** vira recibo: o aparelho vai reenviar depois de
    // reconciliar, com outra versão base, e gravar o recibo agora faria essa
    // segunda tentativa voltar como duplicada.
    return {
      mutationId: mutation.mutationId,
      entityId: mutation.entityId,
      status: "conflict",
      version: atual?.version,
      current: await currentSnapshot(userId, mutation.entityId),
    };
  }

  try {
    if (mutation.operation === "delete") {
      await softDeleteTransaction(userId, mutation.entityId, {
        deviceId,
        mutationId: mutation.mutationId,
      });
    } else {
      await writeTransaction(userId, deviceId, mutation, decisao.nextVersion, now);
    }
  } catch (erro) {
    return record(userId, deviceId, mutation, {
      mutationId: mutation.mutationId,
      entityId: mutation.entityId,
      status: "rejected",
      message: isDomainError(erro) ? erro.message : "Não foi possível gravar este lançamento",
    }, now);
  }

  return record(userId, deviceId, mutation, {
    mutationId: mutation.mutationId,
    entityId: mutation.entityId,
    status: "applied",
    version: decisao.nextVersion,
  }, now);
}

async function record(
  userId: string,
  deviceId: string,
  mutation: Mutation,
  result: MutationResult,
  now: Date,
): Promise<MutationResult> {
  await getDatabase()
    .insert(syncMutations)
    .values({
      id: newId(now.getTime()),
      userId,
      mutationId: mutation.mutationId,
      deviceId,
      entity: mutation.entity,
      entityId: mutation.entityId,
      operation: mutation.operation,
      status: result.status,
      resultJson: JSON.stringify(result),
    })
    .onConflictDoNothing();

  return result;
}

/**
 * Monta o lançamento a partir do payload do aparelho.
 *
 * Os mesmos serviços do lado web não servem aqui: eles geram identificador e
 * versão, e na sincronização os dois vêm do aparelho. O que **é** reusado é o
 * domínio — competência, postagem no razão, recompensa.
 */
async function writeTransaction(
  userId: string,
  deviceId: string,
  mutation: Mutation,
  version: number,
  now: Date,
): Promise<void> {
  const dados = mutation.data ?? {};

  const kind = pickKind(dados.kind);
  const amount = pickAmount(dados.amount ?? dados.amountCents);
  const occurredOn = parseLocalDate(dados.occurredOn) ?? todayIn(now);
  const origem = await resolveParty(userId, dados);

  const card = origem.kind === "card" ? await findCard(userId, origem.cardId) : null;
  const destino = resolveDestination(kind, dados);

  // Pagamento de fatura precisa dizer **qual** fatura: a competência do
  // pagamento é a da fatura quitada, que costuma ser anterior ao mês em que o
  // dinheiro sai. Derivá-la da data creditaria a fatura errada em silêncio.
  const competenciaDeclarada = parseCompetence(dados.competence);
  if (kind === "invoice_payment" && !competenciaDeclarada) {
    throw validationError("O pagamento de fatura precisa informar a competência", [
      { path: "competence", message: "Informe a fatura que está sendo paga" },
    ]);
  }

  const competence =
    competenciaDeclarada && kind === "invoice_payment"
      ? competenciaDeclarada
      : card
        ? competenceForPurchase(card, occurredOn)
        : competenceOf(occurredOn);

  if (card) {
    await ensureInvoices({ userId, cardId: card.id, cycle: card, competences: [competence] });
  }

  const transaction: Transaction = {
    id: mutation.entityId,
    userId,
    kind,
    state: dados.state === "planned" ? "planned" : "confirmed",
    source: "manual",
    description: String(dados.description ?? "Lançamento").slice(0, 160),
    categoryId: typeof dados.categoryId === "string" ? dados.categoryId : null,
    amount,
    currency: "BRL",
    occurredOn,
    origin: origem,
    destination: destino,
    competence,
    tripId: typeof dados.tripId === "string" ? dados.tripId : null,
    installmentPlanId: null,
    installmentNumber: null,
    recurrenceId: null,
    notes: typeof dados.notes === "string" ? dados.notes.slice(0, 500) : null,
  };

  const reward = card ? await earningForPurchase(card, amount, now) : null;

  await saveTransactionBatch([
    { transaction, options: { deviceId, mutationId: mutation.mutationId, version, reward } },
  ]);
}

/**
 * Destino do lançamento, quando o tipo tem um.
 *
 * Transferência vai para conta; pagamento de fatura vai para cartão. Tratar os
 * dois como "conta de destino" faria o pagamento perder o cartão quitado e o
 * lançamento deixaria de ser postável.
 */
function resolveDestination(kind: Transaction["kind"], dados: Record<string, unknown>): Party | null {
  if (kind === "transfer" && typeof dados.destinationAccountId === "string") {
    return accountParty(dados.destinationAccountId);
  }
  if (kind === "invoice_payment" && typeof dados.destinationCardId === "string") {
    return cardParty(dados.destinationCardId);
  }
  return null;
}

function pickKind(value: unknown): Transaction["kind"] {
  return value === "income" || value === "transfer" || value === "invoice_payment" ? value : "expense";
}

function pickAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return cents(Math.abs(Math.round(value)));
  if (typeof value === "string") {
    const interpretado = parseMoney(value);
    if (interpretado) return cents(Math.abs(interpretado));
  }
  return cents(0);
}

async function resolveParty(userId: string, dados: Record<string, unknown>): Promise<Party> {
  if (typeof dados.cardId === "string" && dados.cardId) {
    const card = await findCard(userId, dados.cardId);
    if (card) return cardParty(card.id);
  }
  if (typeof dados.accountId === "string" && dados.accountId) {
    const account = await findAccount(userId, dados.accountId);
    if (account) return accountParty(account.id);
  }
  // Sem origem resolvível o lançamento não pode existir; a exceção vira
  // `rejected` para aquela mutação, sem derrubar o lote.
  throw new Error("Conta ou cartão não encontrado");
}

async function currentSnapshot(userId: string, entityId: string): Promise<Record<string, unknown> | null> {
  const database = getDatabase();
  const [linha] = await database
    .select()
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.id, entityId)))
    .limit(1);

  return linha ? serialize(linha) : null;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/**
 * Puxa o que mudou depois do cursor.
 *
 * A paginação é por chave, não por deslocamento: `OFFSET` pula registro quando
 * algo é gravado entre duas páginas, e numa sincronização isso vira lançamento
 * que nunca chega ao aparelho.
 */
async function pullChanges(
  userId: string,
  cursor: SyncCursor | null,
): Promise<{ changes: Record<string, unknown>[]; cursor: SyncCursor | null; hasMore: boolean }> {
  const database = getDatabase();

  const depoisDoCursor = cursor
    ? or(
        gt(transactions.updatedAt, cursor.updatedAt),
        and(eq(transactions.updatedAt, cursor.updatedAt), gt(transactions.id, cursor.id)),
      )
    : undefined;

  const linhas = await database
    .select()
    .from(transactions)
    .where(depoisDoCursor ? and(eq(transactions.userId, userId), depoisDoCursor) : eq(transactions.userId, userId))
    .orderBy(asc(transactions.updatedAt), asc(transactions.id))
    .limit(PAGE_SIZE + 1);

  const pagina = linhas.slice(0, PAGE_SIZE);
  const ultima = pagina.at(-1);

  return {
    changes: pagina.map(serialize),
    cursor: ultima ? { updatedAt: ultima.updatedAt, id: ultima.id } : cursor,
    hasMore: linhas.length > PAGE_SIZE,
  };
}

/**
 * Cadastros, só quando mudaram.
 *
 * Conta, categoria e cartão mudam raramente. Mandar os três a cada
 * sincronização gastaria dados do usuário para repetir o que ele já tem.
 */
async function pullCatalog(userId: string, cursor: SyncCursor | null): Promise<SyncResponse["catalog"]> {
  const database = getDatabase();
  const desde = cursor?.updatedAt;

  const [contas, categorias, cartoes] = await Promise.all([
    database
      .select()
      .from(accounts)
      .where(desde ? and(eq(accounts.userId, userId), gte(accounts.updatedAt, desde)) : eq(accounts.userId, userId)),
    database
      .select()
      .from(categories)
      .where(
        desde ? and(eq(categories.userId, userId), gte(categories.updatedAt, desde)) : eq(categories.userId, userId),
      ),
    database
      .select()
      .from(cards)
      .where(desde ? and(eq(cards.userId, userId), gte(cards.updatedAt, desde)) : eq(cards.userId, userId)),
  ]);

  if (!contas.length && !categorias.length && !cartoes.length) return null;

  return {
    accounts: contas.map((conta) => ({
      id: conta.id,
      name: conta.name,
      kind: conta.kind,
      currency: conta.currency,
      // Sem o saldo inicial o aparelho não tem como derivar saldo offline: o
      // razão é "início + movimentações", e mandar só as movimentações daria
      // um número diferente do que o site mostra.
      openingBalanceCents: conta.openingBalanceCents,
      color: conta.color,
      archivedAt: conta.archivedAt,
    })),
    categories: categorias.map((categoria) => ({
      id: categoria.id,
      name: categoria.name,
      kind: categoria.kind,
      color: categoria.color,
      archivedAt: categoria.archivedAt,
    })),
    cards: cartoes.map((cartao) => ({
      id: cartao.id,
      name: cartao.name,
      kind: cartao.kind,
      closingDay: cartao.closingDay,
      dueDay: cartao.dueDay,
      dueAdjustment: cartao.dueAdjustment,
      // Limite disponível é uma das telas principais do aplicativo, e sem o
      // teto cadastrado não há como calculá-lo offline.
      limitCents: cartao.limitCents,
      color: cartao.color,
      archivedAt: cartao.archivedAt,
    })),
  };
}

/** Forma enxuta do lançamento no fio. O aparelho não precisa de tudo. */
function serialize(linha: typeof transactions.$inferSelect): Record<string, unknown> {
  return {
    id: linha.id,
    kind: linha.kind,
    state: linha.state,
    description: linha.description,
    categoryId: linha.categoryId,
    amountCents: linha.amountCents,
    occurredOn: linha.occurredOn,
    competence: linha.competence,
    accountId: linha.originAccountId,
    cardId: linha.originCardId,
    destinationAccountId: linha.destinationAccountId,
    // Sem isto, um pagamento de fatura chega ao aparelho sem destino e não
    // pode ser postado no razão: `postTransaction` exige o cartão quitado.
    destinationCardId: linha.destinationCardId,
    tripId: linha.tripId,
    installmentNumber: linha.installmentNumber,
    notes: linha.notes,
    version: linha.version,
    deletedAt: linha.deletedAt,
    updatedAt: linha.updatedAt,
  };
}

/** Só para diagnóstico: quantas mutações este usuário já sincronizou. */
export async function mutationCount(userId: string): Promise<number> {
  const database = getDatabase();
  const [linha] = await database
    .select({ total: sql<number>`count(*)` })
    .from(syncMutations)
    .where(eq(syncMutations.userId, userId));
  return Number(linha?.total ?? 0);
}
