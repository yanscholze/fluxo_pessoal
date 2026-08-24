/**
 * Serviço de orçamentos.
 *
 * O gasto por categoria vem do razão, não de um contador próprio: orçamento é
 * uma leitura sobre os lançamentos, e manter um total à parte seria mais um
 * número para divergir.
 */

import {
  type Budget,
  type BudgetStatus,
  type BudgetTotals,
  appliesTo,
  budgetStatus,
  summarizeBudgets,
} from "../../core/domain/budget/budget.ts";
import { CONSUMPTION } from "../../core/domain/ledger/balance.ts";
import { conflict, notFound } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { type Cents, cents } from "../../core/kernel/money.ts";
import { type Competence, competenceOf } from "../../core/time/competence.ts";
import { type LocalDate, localDate, todayIn } from "../../core/time/local-date.ts";
import { and, eq } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import { budgets } from "../db/schema/index.ts";
import { listCategories } from "../repositories/catalog.ts";
import { loadLedger, transactionIndex } from "../repositories/ledger.ts";

export type BudgetView = BudgetStatus & {
  readonly budgetId: string;
  readonly categoryName: string;
  readonly categoryColor: string;
};

export type BudgetsView = {
  readonly competence: Competence;
  readonly today: LocalDate;
  readonly budgets: readonly BudgetView[];
  readonly totals: BudgetTotals;
  /** Categorias de despesa ainda sem orçamento, com o gasto do mês. */
  readonly uncovered: readonly { categoryId: string; name: string; color: string; spentCents: number }[];
};

function toBudget(row: typeof budgets.$inferSelect): Budget {
  return {
    id: row.id,
    userId: row.userId,
    categoryId: row.categoryId,
    amount: cents(row.amountCents),
    startsOn: localDate(row.startsOn),
    endsOn: row.endsOn ? localDate(row.endsOn) : null,
  };
}

export async function buildBudgetsView(
  userId: string,
  competence?: Competence,
  now: Date = new Date(),
): Promise<BudgetsView> {
  const today = todayIn(now);
  const mes = competence ?? competenceOf(today);

  const database = getDatabase();
  const [rows, categories, entries, index] = await Promise.all([
    database.select().from(budgets).where(eq(budgets.userId, userId)),
    listCategories(userId),
    loadLedger(userId),
    transactionIndex(userId),
  ]);

  const gastoPorCategoria = new Map<string, number>();
  // Contar lançamentos distintos, não movimentações: a projeção só extrapola
  // quando há mais de um gasto, e uma compra parcelada não deve virar "ritmo".
  const lancamentosPorCategoria = new Map<string, Set<string>>();

  for (const entry of entries) {
    if (entry.state !== "confirmed" || entry.competence !== mes || entry.amount >= 0) continue;
    if (!CONSUMPTION.includes(entry.kind)) continue;
    const categoryId = index.get(entry.transactionId)?.categoryId;
    if (!categoryId) continue;
    gastoPorCategoria.set(categoryId, (gastoPorCategoria.get(categoryId) ?? 0) - entry.amount);
    const vistos = lancamentosPorCategoria.get(categoryId) ?? new Set<string>();
    vistos.add(entry.transactionId);
    lancamentosPorCategoria.set(categoryId, vistos);
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const views: BudgetView[] = rows
    .map(toBudget)
    .filter((budget) => appliesTo(budget, mes))
    .map((budget) => {
      const category = categoryById.get(budget.categoryId);
      const status = budgetStatus(
        budget,
        mes,
        cents(gastoPorCategoria.get(budget.categoryId) ?? 0),
        today,
        lancamentosPorCategoria.get(budget.categoryId)?.size ?? 0,
      );
      return {
        ...status,
        budgetId: budget.id,
        categoryName: category?.name ?? "Categoria removida",
        categoryColor: category?.color ?? "#6b7280",
      };
    })
    // Quem está mais perto de estourar aparece primeiro: é o que exige decisão.
    .sort((left, right) => right.percentUsed - left.percentUsed);

  const comOrcamento = new Set(views.map((view) => view.categoryId));

  return {
    competence: mes,
    today,
    budgets: views,
    totals: summarizeBudgets(views),
    uncovered: categories
      .filter((category) => category.kind === "expense" && !comOrcamento.has(category.id))
      .map((category) => ({
        categoryId: category.id,
        name: category.name,
        color: category.color,
        spentCents: gastoPorCategoria.get(category.id) ?? 0,
      }))
      .filter((item) => item.spentCents > 0)
      .sort((left, right) => right.spentCents - left.spentCents),
  };
}

export type BudgetInput = {
  readonly categoryId: string;
  readonly amount: Cents;
  readonly startsOn?: LocalDate | null;
};

export async function setBudget(userId: string, input: BudgetInput, now: Date = new Date()): Promise<string> {
  const categories = await listCategories(userId);
  const category = categories.find((item) => item.id === input.categoryId);
  if (!category) throw notFound("Categoria", input.categoryId);
  if (category.kind !== "expense") throw conflict("Só categoria de saída tem orçamento");

  // A vigência começa no primeiro dia da competência para o orçamento valer o
  // mês inteiro, mesmo criado no dia 20.
  const startsOn = input.startsOn ?? (`${competenceOf(todayIn(now))}-01` as LocalDate);
  const database = getDatabase();
  const id = newId(now.getTime());

  await database
    .insert(budgets)
    .values({
      id,
      userId,
      categoryId: input.categoryId,
      amountCents: input.amount as number,
      startsOn: startsOn as string,
    })
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.categoryId, budgets.startsOn],
      set: { amountCents: input.amount as number, updatedAt: now.toISOString() },
    });

  return id;
}

export async function removeBudget(userId: string, budgetId: string): Promise<void> {
  await getDatabase().delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.id, budgetId)));
}
