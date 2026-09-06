/**
 * Serviço de cadastros: contas, categorias e cartões.
 *
 * Renomear é um `UPDATE` numa linha. Na versão anterior, mudar o nome de uma
 * conta disparava cascata por cinco tabelas, porque o nome **era** a chave
 * estrangeira — e qualquer falha no meio deixava lançamentos apontando para
 * uma conta que não existia mais.
 */

import { and, count, eq, isNull, max, or } from "drizzle-orm";

import { SUPPORTED_CURRENCIES, type AccountKind, type CurrencyCode } from "../../core/domain/account/types.ts";
import { assertValidCycle, type CycleConfig, scheduleFor } from "../../core/domain/card/invoice-cycle.ts";
import { conflict, duplicate, notFound, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import type { Cents } from "../../core/kernel/money.ts";
import type { Competence } from "../../core/time/competence.ts";
import { type LocalDate, todayIn } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import {
  accounts,
  cards,
  categories,
  invoices,
  ledgerEntries,
  recurrences,
  transactions,
} from "../db/schema/index.ts";

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

export type AccountInput = {
  readonly name: string;
  readonly kind: AccountKind;
  readonly institution?: string | null;
  readonly currency?: string | null;
  readonly openingBalance?: Cents | null;
  readonly openedOn?: LocalDate | null;
  readonly goalAmount?: Cents | null;
  readonly monthlyYieldBasisPoints?: number | null;
  readonly includeInTotals?: boolean;
  readonly color?: string | null;
};

function assertCurrency(value: string | null | undefined): CurrencyCode {
  const code = (value ?? "BRL").toUpperCase();
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(code)) {
    throw validationError("Moeda não suportada", [{ path: "currency", message: `Use uma de: ${SUPPORTED_CURRENCIES.join(", ")}` }]);
  }
  return code as CurrencyCode;
}

export async function createAccount(userId: string, input: AccountInput, now: Date = new Date()): Promise<string> {
  const database = getDatabase();
  const id = newId(now.getTime());

  const [existing] = await database
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.name, input.name)))
    .limit(1);
  if (existing) throw duplicate("Já existe uma conta com este nome");

  const [order] = await database
    .select({ value: max(accounts.sortOrder) })
    .from(accounts)
    .where(eq(accounts.userId, userId));

  await database.insert(accounts).values({
    id,
    userId,
    name: input.name,
    institution: input.institution ?? "manual",
    kind: input.kind,
    currency: assertCurrency(input.currency),
    openingBalanceCents: (input.openingBalance ?? 0) as number,
    openedOn: (input.openedOn ?? todayIn(now)) as string,
    goalCents: (input.goalAmount ?? null) as number | null,
    monthlyYieldBasisPoints: input.monthlyYieldBasisPoints ?? 0,
    includeInTotals: input.includeInTotals ?? true,
    color: input.color ?? "#6b7280",
    sortOrder: (order?.value ?? -1) + 1,
  });

  return id;
}

export async function updateAccount(
  userId: string,
  accountId: string,
  input: Partial<AccountInput>,
  now: Date = new Date(),
): Promise<void> {
  const database = getDatabase();
  const [existing] = await database
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
    .limit(1);
  if (!existing) throw notFound("Conta", accountId);

  await database
    .update(accounts)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.institution !== undefined ? { institution: input.institution ?? "manual" } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.currency !== undefined ? { currency: assertCurrency(input.currency) } : {}),
      ...(input.openingBalance !== undefined ? { openingBalanceCents: input.openingBalance as number } : {}),
      ...(input.goalAmount !== undefined ? { goalCents: input.goalAmount as number | null } : {}),
      ...(input.monthlyYieldBasisPoints !== undefined
        ? { monthlyYieldBasisPoints: input.monthlyYieldBasisPoints ?? 0 }
        : {}),
      ...(input.includeInTotals !== undefined ? { includeInTotals: input.includeInTotals } : {}),
      ...(input.color !== undefined ? { color: input.color ?? "#6b7280" } : {}),
      updatedAt: now.toISOString(),
    })
    .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)));
}

/**
 * Arquiva uma conta.
 *
 * Conta com histórico **não** é apagada: apagar reescreveria o passado, e o
 * saldo de meses anteriores deixaria de fechar. Arquivar tira da tela e dos
 * totais, preservando o razão.
 */
export async function archiveAccount(userId: string, accountId: string, now: Date = new Date()): Promise<"archived" | "deleted"> {
  const database = getDatabase();
  const [existing] = await database
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)))
    .limit(1);
  if (!existing) throw notFound("Conta", accountId);
  if (existing.isProtected) throw conflict("Esta conta está protegida contra exclusão");

  const [{ total } = { total: 0 }] = await database
    .select({ total: count() })
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.userId, userId), eq(ledgerEntries.accountId, accountId)));

  /*
   * O lançamento apagado também segura a conta.
   *
   * A exclusão é lógica: a linha fica com `deleted_at` preenchido, e as
   * entradas dela saem do razão — o contador acima zera. Mas `transactions`
   * aponta para a conta com `restrict`, e essa referência não sumiu. Sem olhar
   * aqui, o serviço tentava apagar de fato e o banco recusava com "Failed
   * query", que chegava à tela como erro interno.
   */
  const [{ total: historico } = { total: 0 }] = await database
    .select({ total: count() })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        or(eq(transactions.originAccountId, accountId), eq(transactions.destinationAccountId, accountId)),
      ),
    );

  if (total > 0 || historico > 0) {
    await database
      .update(accounts)
      .set({ archivedAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)));
    return "archived";
  }

  /*
   * Cartão ativo impede; cartão arquivado só impede **apagar**.
   *
   * A distinção importa porque a chave estrangeira não some quando o cartão é
   * arquivado: a linha continua apontando para a conta, e a exclusão falharia
   * no banco. Um erro de conflito para o cartão que o usuário ainda usa é
   * resposta; para um cartão que ele já arquivou é obstáculo sem explicação —
   * foi o que travou uma reimportação, com cinco cartões arquivados prendendo
   * as oito contas. Nesse caso a conta é arquivada, que é o mais perto de
   * apagar que dá para chegar sem quebrar referência.
   */
  const [{ total: ativos } = { total: 0 }] = await database
    .select({ total: count() })
    .from(cards)
    .where(
      and(eq(cards.userId, userId), eq(cards.paymentAccountId, accountId), isNull(cards.archivedAt)),
    );
  if (ativos > 0) throw conflict("Há cartões que pagam a fatura por esta conta");

  const [{ total: arquivados } = { total: 0 }] = await database
    .select({ total: count() })
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.paymentAccountId, accountId)));

  if (arquivados > 0) {
    await database
      .update(accounts)
      .set({ archivedAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)));
    return "archived";
  }

  await database.delete(accounts).where(and(eq(accounts.userId, userId), eq(accounts.id, accountId)));
  return "deleted";
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export type CategoryInput = {
  readonly name: string;
  readonly kind: "expense" | "income";
  readonly parentId?: string | null;
  readonly color?: string | null;
  readonly icon?: string | null;
  readonly isEssential?: boolean;
  readonly excludeFromFreeToSpend?: boolean;
};

export async function createCategory(userId: string, input: CategoryInput, now: Date = new Date()): Promise<string> {
  const database = getDatabase();

  const [existing] = await database
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, input.name), eq(categories.kind, input.kind)))
    .limit(1);
  if (existing) throw duplicate("Já existe uma categoria com este nome neste fluxo");

  if (input.parentId) {
    const [parent] = await database
      .select({ id: categories.id, kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, input.parentId)))
      .limit(1);
    if (!parent) throw notFound("Categoria pai", input.parentId);
    if (parent.kind !== input.kind) throw conflict("A subcategoria precisa ter o mesmo fluxo da categoria pai");
  }

  const id = newId(now.getTime());
  const [order] = await database
    .select({ value: max(categories.sortOrder) })
    .from(categories)
    .where(eq(categories.userId, userId));

  await database.insert(categories).values({
    id,
    userId,
    name: input.name,
    kind: input.kind,
    parentId: input.parentId ?? null,
    color: input.color ?? "#6b7280",
    icon: input.icon ?? "tag",
    // "Essencial" só faz sentido para gasto: alimenta a reserva de emergência.
    isEssential: input.kind === "expense" ? (input.isEssential ?? false) : false,
    excludeFromFreeToSpend: input.excludeFromFreeToSpend ?? false,
    sortOrder: (order?.value ?? -1) + 1,
  });

  return id;
}

export async function archiveCategory(userId: string, categoryId: string, now: Date = new Date()): Promise<void> {
  const database = getDatabase();

  /*
   * Conta **toda** transação, inclusive a apagada.
   *
   * A exclusão de lançamento é lógica: a linha fica no banco com `deleted_at`
   * preenchido, para a sincronização com o aparelho continuar coerente. Mas a
   * chave estrangeira é `restrict` e não sabe disso — ignorando as apagadas, o
   * contador dava zero, o serviço tentava apagar de fato e o banco recusava
   * com "Failed query", que virava erro 500 na tela.
   */
  const [{ total } = { total: 0 }] = await database
    .select({ total: count() })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.categoryId, categoryId)));

  if (total > 0) {
    await database
      .update(categories)
      .set({ archivedAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(and(eq(categories.userId, userId), eq(categories.id, categoryId)));
    return;
  }

  await database.delete(categories).where(and(eq(categories.userId, userId), eq(categories.id, categoryId)));
}

// ---------------------------------------------------------------------------
// Cartões
// ---------------------------------------------------------------------------

export type CardInput = {
  readonly name: string;
  readonly kind: "credit" | "debit";
  readonly paymentAccountId: string;
  readonly closingDay: number;
  readonly dueDay: number;
  readonly dueAdjustment?: "previous" | "next";
  readonly limit?: Cents | null;
  readonly brand?: string | null;
  readonly tier?: string | null;
  readonly last4?: string | null;
  readonly color?: string | null;
  readonly isPrimary?: boolean;
  readonly rewardMode?: "none" | "points" | "cashback" | "both";
  readonly pointsPerDollarMilli?: number | null;
  readonly cashbackBasisPoints?: number | null;
  readonly pointsGoal?: number | null;
  readonly manualUsdRateMicros?: number | null;
};

export async function createCard(userId: string, input: CardInput, now: Date = new Date()): Promise<string> {
  const database = getDatabase();

  assertValidCycle({
    closingDay: input.closingDay,
    dueDay: input.dueDay,
    dueAdjustment: input.dueAdjustment ?? "next",
  });

  const [account] = await database
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.id, input.paymentAccountId)))
    .limit(1);
  if (!account) throw notFound("Conta de pagamento", input.paymentAccountId);

  const [existing] = await database
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.name, input.name)))
    .limit(1);
  if (existing) throw duplicate("Já existe um cartão com este nome");

  const id = newId(now.getTime());
  const [order] = await database.select({ value: max(cards.sortOrder) }).from(cards).where(eq(cards.userId, userId));
  const [{ total } = { total: 0 }] = await database
    .select({ total: count() })
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.kind, "credit")));

  // O primeiro cartão de crédito vira o principal: é ele que define a janela
  // do "livre para gastar", e essa escolha precisa ser explícita desde o
  // começo, não adivinhada depois.
  const isPrimary = input.isPrimary ?? (input.kind === "credit" && total === 0);
  if (isPrimary) await clearPrimary(userId, now);

  await database.insert(cards).values({
    id,
    userId,
    paymentAccountId: input.paymentAccountId,
    name: input.name,
    kind: input.kind,
    brand: input.brand ?? "",
    tier: input.tier ?? "",
    last4: (input.last4 ?? "").replace(/\D/g, "").slice(-4),
    limitCents: (input.limit ?? 0) as number,
    closingDay: input.closingDay,
    dueDay: input.dueDay,
    dueAdjustment: input.dueAdjustment ?? "next",
    rewardMode: input.rewardMode ?? "none",
    pointsPerDollarMilli: input.pointsPerDollarMilli ?? 0,
    cashbackBasisPoints: input.cashbackBasisPoints ?? 0,
    pointsGoal: input.pointsGoal ?? 0,
    manualUsdRateMicros: input.manualUsdRateMicros ?? 0,
    color: input.color ?? "#6b7280",
    isPrimary,
    sortOrder: (order?.value ?? -1) + 1,
  });

  return id;
}

export type CardPatch = {
  readonly name?: string | null;
  readonly paymentAccountId?: string | null;
  readonly closingDay?: number | null;
  readonly dueDay?: number | null;
  readonly dueAdjustment?: "previous" | "next" | null;
  readonly limit?: Cents | null;
  readonly brand?: string | null;
  readonly tier?: string | null;
  readonly last4?: string | null;
  readonly color?: string | null;
  readonly rewardMode?: "none" | "points" | "cashback" | "both" | null;
  readonly pointsPerDollarMilli?: number | null;
  readonly cashbackBasisPoints?: number | null;
  readonly pointsGoal?: number | null;
  readonly manualUsdRateMicros?: number | null;
};

/**
 * Corrige um cartão já cadastrado.
 *
 * O caso que obriga esta função a existir é o dia de fechamento digitado
 * errado. Ele não é um enfeite do cadastro: é o que decide em qual fatura cada
 * compra cai. Errado, todas as competências saem erradas — e, sem edição, a
 * única saída seria apagar o cartão e perder o histórico junto.
 *
 * Mudar o ciclo **não** reescreve fatura fechada ou paga: aquelas já viraram
 * fato, com data de vencimento que alguém honrou. O que se recalcula são as
 * faturas abertas cujo fechamento ainda não chegou — essas ainda são previsão,
 * e previsão tem de seguir o ciclo corrente.
 */
export async function updateCard(
  userId: string,
  cardId: string,
  patch: CardPatch,
  now: Date = new Date(),
): Promise<void> {
  const database = getDatabase();

  const [atual] = await database
    .select()
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.id, cardId)))
    .limit(1);
  if (!atual) throw notFound("Cartão", cardId);

  const ciclo = {
    closingDay: patch.closingDay ?? atual.closingDay,
    dueDay: patch.dueDay ?? atual.dueDay,
    dueAdjustment: patch.dueAdjustment ?? atual.dueAdjustment,
  };
  assertValidCycle(ciclo);

  if (patch.paymentAccountId) {
    const [conta] = await database
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.id, patch.paymentAccountId)))
      .limit(1);
    if (!conta) throw notFound("Conta de pagamento", patch.paymentAccountId);
  }

  if (patch.name && patch.name !== atual.name) {
    const [homonimo] = await database
      .select({ id: cards.id })
      .from(cards)
      .where(and(eq(cards.userId, userId), eq(cards.name, patch.name)))
      .limit(1);
    if (homonimo) throw duplicate("Já existe um cartão com este nome");
  }

  const campos: Record<string, unknown> = { updatedAt: now.toISOString() };
  if (patch.name) campos.name = patch.name;
  if (patch.paymentAccountId) campos.paymentAccountId = patch.paymentAccountId;
  if (patch.closingDay != null) campos.closingDay = patch.closingDay;
  if (patch.dueDay != null) campos.dueDay = patch.dueDay;
  if (patch.dueAdjustment) campos.dueAdjustment = patch.dueAdjustment;
  if (patch.limit != null) campos.limitCents = patch.limit as number;
  if (patch.brand != null) campos.brand = patch.brand;
  if (patch.tier != null) campos.tier = patch.tier;
  if (patch.last4 != null) campos.last4 = patch.last4.replace(/\D/g, "").slice(-4);
  if (patch.color) campos.color = patch.color;
  if (patch.rewardMode) campos.rewardMode = patch.rewardMode;
  if (patch.pointsPerDollarMilli != null) campos.pointsPerDollarMilli = patch.pointsPerDollarMilli;
  if (patch.cashbackBasisPoints != null) campos.cashbackBasisPoints = patch.cashbackBasisPoints;
  if (patch.pointsGoal != null) campos.pointsGoal = patch.pointsGoal;
  if (patch.manualUsdRateMicros != null) campos.manualUsdRateMicros = patch.manualUsdRateMicros;

  await database
    .update(cards)
    .set(campos)
    .where(and(eq(cards.userId, userId), eq(cards.id, cardId)));

  const mudouOCiclo =
    ciclo.closingDay !== atual.closingDay ||
    ciclo.dueDay !== atual.dueDay ||
    ciclo.dueAdjustment !== atual.dueAdjustment;

  if (mudouOCiclo) await reagendarFaturasAbertas(userId, cardId, ciclo, now);
}

/**
 * Reescreve as datas das faturas que ainda não fecharam.
 *
 * Só as `open` com fechamento no futuro. Uma fatura cujo fechamento já passou
 * — mesmo ainda aberta — recebeu compras sob a regra antiga, e mover a data
 * dela mudaria retroativamente onde essas compras caíram.
 */
async function reagendarFaturasAbertas(
  userId: string,
  cardId: string,
  cycle: CycleConfig,
  now: Date,
): Promise<void> {
  const database = getDatabase();
  const hoje = todayIn(now);

  const abertas = await database
    .select({ id: invoices.id, competence: invoices.competence, closingDate: invoices.closingDate })
    .from(invoices)
    .where(and(eq(invoices.userId, userId), eq(invoices.cardId, cardId), eq(invoices.status, "open")));

  for (const fatura of abertas) {
    if ((fatura.closingDate as LocalDate) <= hoje) continue;

    const agenda = scheduleFor(cycle, fatura.competence as Competence);
    await database
      .update(invoices)
      .set({
        closingDate: agenda.closingDate,
        dueDate: agenda.dueDate,
        updatedAt: now.toISOString(),
      })
      .where(eq(invoices.id, fatura.id));
  }
}

async function clearPrimary(userId: string, now: Date): Promise<void> {
  await getDatabase()
    .update(cards)
    .set({ isPrimary: false, updatedAt: now.toISOString() })
    .where(and(eq(cards.userId, userId), eq(cards.isPrimary, true)));
}

/** Define qual cartão define a janela do "livre para gastar". */
export async function setPrimaryCard(userId: string, cardId: string, now: Date = new Date()): Promise<void> {
  const database = getDatabase();
  const [card] = await database
    .select({ id: cards.id, kind: cards.kind })
    .from(cards)
    .where(and(eq(cards.userId, userId), eq(cards.id, cardId)))
    .limit(1);
  if (!card) throw notFound("Cartão", cardId);
  if (card.kind !== "credit") throw conflict("Só um cartão de crédito pode ser o principal");

  await clearPrimary(userId, now);
  await database
    .update(cards)
    .set({ isPrimary: true, updatedAt: now.toISOString() })
    .where(and(eq(cards.userId, userId), eq(cards.id, cardId)));
}

export async function archiveCard(userId: string, cardId: string, now: Date = new Date()): Promise<void> {
  const database = getDatabase();

  const [{ total } = { total: 0 }] = await database
    .select({ total: count() })
    .from(recurrences)
    .where(and(eq(recurrences.userId, userId), eq(recurrences.cardId, cardId), eq(recurrences.isActive, true)));
  if (total > 0) throw conflict("Há recorrências ativas neste cartão. Ajuste-as antes de arquivar.");

  await database
    .update(cards)
    .set({ archivedAt: now.toISOString(), isPrimary: false, updatedAt: now.toISOString() })
    .where(and(eq(cards.userId, userId), eq(cards.id, cardId)));
}

/**
 * Cadastro inicial de um usuário novo.
 *
 * Uma tela vazia não ensina nada. Estas categorias cobrem o gasto comum de
 * quem está começando e podem ser renomeadas ou apagadas à vontade.
 */
export async function seedDefaults(userId: string, now: Date = new Date()): Promise<void> {
  const padroes: CategoryInput[] = [
    { name: "Moradia", kind: "expense", isEssential: true, color: "#7c5cff" },
    { name: "Alimentação", kind: "expense", isEssential: true, color: "#0d9f6e" },
    { name: "Transporte", kind: "expense", isEssential: true, color: "#38bdf8" },
    { name: "Saúde", kind: "expense", isEssential: true, color: "#dc2b3d" },
    { name: "Lazer", kind: "expense", color: "#fb923c" },
    { name: "Compras", kind: "expense", color: "#c77700" },
    { name: "Assinaturas", kind: "expense", color: "#8f8f9c" },
    { name: "Salário", kind: "income", color: "#0d9f6e" },
    { name: "Outras entradas", kind: "income", color: "#38bdf8" },
  ];

  for (const categoria of padroes) {
    await createCategory(userId, categoria, now).catch(() => undefined);
  }
}
