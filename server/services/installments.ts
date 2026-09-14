/**
 * Serviço de parcelamentos.
 *
 * Responde as duas perguntas que o usuário faz: "quanto disso ainda devo, mês
 * a mês?" e "e se eu antecipar?".
 */

import { activeCompetence } from "../../core/domain/card/invoice-cycle.ts";
import { simulateAnticipation, anticipationLadder } from "../../core/domain/installment/anticipation.ts";
import type { Transaction } from "../../core/domain/ledger/types.ts";
import { conflict, notFound, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { cents, sum } from "../../core/kernel/money.ts";
import {
  type InstallmentProgress,
  type ScheduledInstallment,
  futureCommitmentByCompetence,
  installmentStatus,
  summarizeProgress,
} from "../../core/domain/installment/plan.ts";
import { overdueCompetences } from "../../core/domain/ledger/balance.ts";
import { type Competence, competenceOf } from "../../core/time/competence.ts";
import { type LocalDate, todayIn } from "../../core/time/local-date.ts";
import { and, eq, isNull } from "drizzle-orm";
import { getDatabase } from "../db/client.ts";
import { installmentPlans, transactions } from "../db/schema/index.ts";
import { findCard, listCategories } from "../repositories/catalog.ts";
import { findPlan, listPlans } from "../repositories/installments.ts";
import { findTransactionsByIds, loadLedger, transactionSaveStatements } from "../repositories/ledger.ts";
import { earningForPurchase } from "./rewards.ts";

export type InstallmentEntryView = {
  readonly number: number;
  readonly competence: Competence;
  readonly dueDate: LocalDate;
  readonly amountCents: number;
  readonly status: "paid" | "overdue" | "open";
  readonly transactionId: string | null;
};

export type PlanView = InstallmentProgress & {
  readonly cardId: string;
  readonly cardName: string;
  readonly categoryId: string | null;
  readonly purchaseDate: LocalDate;
  readonly monthlyInterestBasisPoints: number;
  readonly entries: readonly InstallmentEntryView[];
};

export type InstallmentsView = {
  readonly today: LocalDate;
  readonly active: readonly PlanView[];
  readonly settled: readonly PlanView[];
  readonly totals: {
    readonly totalCents: number;
    readonly paidCents: number;
    readonly openCents: number;
    readonly percentPaid: number;
  };
  /** Quanto de parcela já está comprometido em cada mês à frente. */
  readonly commitment: readonly { competence: Competence; amountCents: number }[];
};

const COMMITMENT_MONTHS = 12;

export async function buildInstallmentsView(userId: string, now: Date = new Date()): Promise<InstallmentsView> {
  const today = todayIn(now);
  const [plans, entries] = await Promise.all([listPlans(userId), loadLedger(userId)]);

  const overdueByCard = new Map<string, Set<Competence>>();
  const views: PlanView[] = plans.map(({ plan, card, schedule, transactionIdByNumber }) => {
    const active = card ? activeCompetence(card, today) : competenceOf(today);

    let overdue = overdueByCard.get(plan.cardId);
    if (!overdue) {
      overdue = new Set(card ? overdueCompetences(entries, card.id, active) : []);
      overdueByCard.set(plan.cardId, overdue);
    }

    const progress = summarizeProgress(plan, schedule, active, overdue);

    const installmentEntries: InstallmentEntryView[] = schedule.map((item) => {
      const status = installmentStatus(item.competence, active, overdue);
      return {
        number: item.number,
        competence: item.competence,
        dueDate: item.dueDate,
        amountCents: item.amount,
        status: status === "overdue" && item.dueDate >= today ? "open" : status,
        transactionId: transactionIdByNumber.get(item.number) ?? null,
      };
    });

    return {
      ...progress,
      overdueCount: installmentEntries.filter((item) => item.status === "overdue").length,
      cardId: plan.cardId,
      cardName: card?.name ?? "Cartão removido",
      categoryId: plan.categoryId,
      purchaseDate: plan.purchaseDate,
      monthlyInterestBasisPoints: plan.monthlyInterestBasisPoints,
      entries: installmentEntries,
    };
  });

  const ordenar = (lista: PlanView[]) =>
    [...lista].sort((left, right) => (left.nextDueDate ?? "9999").localeCompare(right.nextDueDate ?? "9999"));

  /*
   * Plano sem parcela nenhuma não é plano — é resto.
   *
   * Ele aparece quando as compras que o compunham foram apagadas e o cabeçalho
   * ficou: uma importação desfeita, um cartão removido. A tela então mostrava
   * dezenas de linhas "quitadas" de R$ 0,00, todas com a mesma aparência de
   * conquista, e enterrava os parcelamentos que ainda estão sendo pagos.
   *
   * O filtro vive na leitura, e não numa limpeza de banco, porque o resto pode
   * nascer de novo a qualquer apagamento — e porque um plano vazio nunca é a
   * resposta certa para nenhuma pergunta desta tela.
   */
  const comParcelas = views.filter((item) => item.totalCount > 0);

  const active = ordenar(comParcelas.filter((item) => !item.isSettled));
  const settled = ordenar(comParcelas.filter((item) => item.isSettled));

  const totalCents = comParcelas.reduce((soma, item) => soma + item.totalAmount, 0);
  const paidCents = comParcelas.reduce((soma, item) => soma + item.paidAmount, 0);

  return {
    today,
    active,
    settled,
    totals: {
      totalCents,
      paidCents,
      openCents: totalCents - paidCents,
      percentPaid: totalCents > 0 ? (paidCents / totalCents) * 100 : 0,
    },
    commitment: futureCommitmentByCompetence(
      // Só o que ainda está em aberto pesa no comprometimento futuro.
      plans.map(({ schedule }) => schedule),
      competenceOf(today),
      COMMITMENT_MONTHS,
    ).map((item) => ({ competence: item.competence, amountCents: item.amount })),
  };
}

export type AnticipationScenario = {
  readonly count: number;
  readonly nominalCents: number;
  readonly dueTodayCents: number;
  readonly savingsCents: number;
  readonly newEndCompetence: Competence | null;
  readonly monthsShortened: number;
  readonly averageMonthlyReliefCents: number;
};

/**
 * Cenários de antecipação de um plano.
 *
 * Numa compra sem juros a economia é zero — e o simulador diz isso, em vez de
 * inventar desconto. O ganho real ali é liberar limite e encurtar o
 * compromisso, que também aparecem no resultado.
 */
export async function simulatePlanAnticipation(
  userId: string,
  planId: string,
  now: Date = new Date(),
): Promise<{ plan: PlanView; scenarios: readonly AnticipationScenario[] }> {
  const view = await buildInstallmentsView(userId, now);
  const plan = [...view.active, ...view.settled].find((item) => item.planId === planId);
  if (!plan) throw notFound("Parcelamento", planId);

  const abertas: ScheduledInstallment[] = plan.entries
    .filter((entry) => entry.status !== "paid")
    .map((entry) => ({
      number: entry.number,
      competence: entry.competence,
      occurredOn: entry.dueDate,
      dueDate: entry.dueDate,
      amount: entry.amountCents as never,
    }));

  if (!abertas.length) return { plan, scenarios: [] };

  const cenarios = anticipationLadder(
    {
      openInstallments: abertas,
      anticipationCompetence: competenceOf(view.today),
      monthlyInterestBasisPoints: plan.monthlyInterestBasisPoints,
    },
    Math.min(abertas.length, 12),
  );

  return {
    plan,
    scenarios: cenarios.map((cenario) => ({
      count: cenario.anticipated.length,
      nominalCents: cenario.nominalAmount,
      dueTodayCents: cenario.amountDueToday,
      savingsCents: cenario.savings,
      newEndCompetence: cenario.newEndCompetence,
      monthsShortened: cenario.monthsShortened,
      averageMonthlyReliefCents: cenario.averageMonthlyRelief,
    })),
  };
}

export { simulateAnticipation };

// ---------------------------------------------------------------------------
// Manutenção do plano
// ---------------------------------------------------------------------------

export type UpdatePlanInput = {
  readonly description?: string | null;
  readonly categoryId?: string | null;
  readonly setCategory?: boolean;
  /** Valor total da compra, não apenas a próxima parcela. */
  readonly totalAmount?: number | null;
};

/**
 * Corrige o cabeçalho e, quando necessário, reparte de novo o valor total.
 *
 * As parcelas continuam nas mesmas datas, faturas e situações. Só seus valores
 * mudam de forma proporcional e sem perder centavos. Assim uma correção de
 * total não transforma uma compra em outra nem solta seus lançamentos do plano.
 */
export async function updateInstallmentPlan(
  userId: string,
  planId: string,
  input: UpdatePlanInput,
  now: Date = new Date(),
): Promise<void> {
  const existente = await findPlan(userId, planId);
  if (!existente) throw notFound("Parcelamento", planId);

  const plan = existente.plan;
  const description = input.description?.trim() || plan.description;
  const categoryId = input.setCategory ? (input.categoryId ?? null) : plan.categoryId;

  if (categoryId) await assertExpenseCategory(userId, categoryId);

  const ids = [...existente.transactionIdByNumber.values()];
  const parcelas = await findTransactionsByIds(userId, ids);
  if (parcelas.length !== ids.length) {
    throw conflict("Não é possível editar um parcelamento com parcelas removidas");
  }

  const total = input.totalAmount ?? plan.totalAmount;
  if (total <= 0) {
    throw validationError("Informe um valor maior que zero", [
      { path: "totalAmount", message: "Informe um valor maior que zero" },
    ]);
  }

  const valores = distributeTotal(total, parcelas.length);
  const card = await findCard(userId, plan.cardId);
  if (!card || card.kind !== "credit") throw conflict("O cartão deste parcelamento não está disponível");

  const atualizadas = [...parcelas]
    .sort((left, right) => (left.installmentNumber ?? 0) - (right.installmentNumber ?? 0))
    .map((parcela, index) => ({
      ...parcela,
      description,
      categoryId,
      amount: valores[index],
    } satisfies Transaction));

  const rewards = await Promise.all(atualizadas.map((parcela) => earningForPurchase(card, parcela.amount, now)));
  const database = getDatabase();
  await database.batch([
    database
      .update(installmentPlans)
      .set({
        description,
        // O apelido é o nome exibido. Mantê-lo igual evita editar o nome e a
        // tela continuar mostrando o texto anterior salvo como apelido.
        label: description,
        categoryId,
        totalAmountCents: total,
        updatedAt: now.toISOString(),
      })
      .where(and(eq(installmentPlans.userId, userId), eq(installmentPlans.id, planId))),
    ...atualizadas.flatMap((parcela, index) =>
      transactionSaveStatements(parcela, { reward: rewards[index] }),
    ),
  ] as never);
}

/** Junta lançamentos já existentes sem mudar valor, data, fatura ou razão. */
export async function groupTransactionsIntoInstallmentPlan(
  userId: string,
  input: { readonly transactionIds: readonly string[]; readonly description: string; readonly categoryId?: string | null },
  now: Date = new Date(),
): Promise<{ planId: string }> {
  const ids = [...new Set(input.transactionIds)];
  if (ids.length < 2) {
    throw validationError("Selecione ao menos dois lançamentos", [
      { path: "transactionIds", message: "Selecione ao menos dois lançamentos" },
    ]);
  }

  const items = await findTransactionsByIds(userId, ids);
  if (items.length !== ids.length) throw notFound("Lançamento", "selecionado");
  if (items.some((item) => item.kind !== "expense" || item.origin.kind !== "card" || item.installmentPlanId)) {
    throw conflict("Só despesas avulsas no mesmo cartão podem formar um parcelamento");
  }

  const cardId = items[0].origin.kind === "card" ? items[0].origin.cardId : null;
  if (!cardId || items.some((item) => item.origin.kind !== "card" || item.origin.cardId !== cardId)) {
    throw conflict("Selecione lançamentos do mesmo cartão");
  }

  const categoryId = input.categoryId ?? items[0].categoryId;
  if (categoryId) await assertExpenseCategory(userId, categoryId);

  const ordered = [...items].sort((left, right) => {
    const competenceOrder = left.competence.localeCompare(right.competence);
    return competenceOrder || left.occurredOn.localeCompare(right.occurredOn) || left.id.localeCompare(right.id);
  });
  const planId = newId(now.getTime());
  const total = sum(ordered.map((item) => item.amount));
  const database = getDatabase();

  await database.batch([
    database.insert(installmentPlans).values({
      id: planId,
      userId,
      cardId,
      categoryId,
      description: input.description.trim(),
      totalAmountCents: total,
      installmentCount: ordered.length,
      purchaseDate: ordered[0].occurredOn,
      firstCompetence: ordered[0].competence,
      monthlyInterestBasisPoints: 0,
      label: input.description.trim(),
      status: "active",
    }),
    ...ordered.map((item, index) =>
      database
        .update(transactions)
        .set({
          description: input.description.trim(),
          categoryId,
          source: "installment",
          installmentPlanId: planId,
          installmentNumber: index + 1,
          updatedAt: now.toISOString(),
        })
        .where(and(eq(transactions.userId, userId), eq(transactions.id, item.id), isNull(transactions.deletedAt))),
    ),
  ] as never);

  return { planId };
}

/** Desfaz só a organização: os lançamentos e seus efeitos no razão permanecem. */
export async function ungroupInstallmentPlan(userId: string, planId: string, now: Date = new Date()): Promise<void> {
  const existente = await findPlan(userId, planId);
  if (!existente) throw notFound("Parcelamento", planId);

  const database = getDatabase();
  await database.batch([
    database
      .update(transactions)
      .set({
        source: "manual",
        installmentPlanId: null,
        installmentNumber: null,
        updatedAt: now.toISOString(),
      })
      .where(and(eq(transactions.userId, userId), eq(transactions.installmentPlanId, planId), isNull(transactions.deletedAt))),
    database.delete(installmentPlans).where(and(eq(installmentPlans.userId, userId), eq(installmentPlans.id, planId))),
  ] as never);
}

function distributeTotal(total: number, count: number) {
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => cents(base + (index < remainder ? 1 : 0)));
}

async function assertExpenseCategory(userId: string, categoryId: string): Promise<void> {
  const category = (await listCategories(userId)).find((item) => item.id === categoryId);
  if (!category) throw notFound("Categoria", categoryId);
  if (category.kind !== "expense") throw conflict("Parcelamento precisa de uma categoria de saída");
}
