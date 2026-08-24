/**
 * Serviço de planejamento.
 *
 * Junta o que se repete — salário, contas fixas, assinaturas — e projeta como
 * os próximos meses ficam. A projeção é derivada das regras a cada consulta;
 * nada é gravado até o usuário confirmar que aconteceu.
 */

import { liquidAccounts } from "../../core/domain/account/types.ts";
import { CONSUMPTION, flow } from "../../core/domain/ledger/balance.ts";
import { projectedInvoicePayments } from "../../core/domain/position/financial-position.ts";
import { projectRecurrences } from "../../core/domain/recurrence/projection.ts";
import {
  type Recurrence,
  type RecurrenceRole,
  nextOccurrence,
  occurrenceAmount,
  occurrenceDate,
  occurrenceKey,
  occurrencesBetween,
} from "../../core/domain/recurrence/schedule.ts";
import { businessDaysInMonth } from "../../core/time/brazilian-calendar.ts";
import {
  type Competence,
  competenceMonth,
  competenceOf,
  competenceYear,
  series,
  shift,
} from "../../core/time/competence.ts";
import { type LocalDate, addDays, todayIn } from "../../core/time/local-date.ts";
import { freeToSpendExclusions, listAccounts, listCards, listCategories } from "../repositories/catalog.ts";
import { loadLedger } from "../repositories/ledger.ts";
import { confirmedOccurrenceKeys, listRecurrences } from "../repositories/recurrences.ts";

export type RecurrenceView = {
  readonly id: string;
  readonly role: RecurrenceRole;
  readonly kind: "expense" | "income" | "transfer";
  readonly description: string;
  readonly amountCents: number;
  readonly amountMode: Recurrence["amountMode"];
  readonly scheduleLabel: string;
  readonly interval: Recurrence["interval"];
  readonly isActive: boolean;
  readonly originName: string;
  readonly categoryName: string | null;
  readonly next: { competence: Competence; date: LocalDate; amountCents: number } | null;
  /** Ocorrência da competência corrente ainda não confirmada. */
  readonly pending: { competence: Competence; date: LocalDate; amountCents: number } | null;
};

export type MonthProjection = {
  readonly competence: Competence;
  readonly businessDays: number;
  readonly incomeCents: number;
  readonly committedCents: number;
  readonly freeCents: number;
};

export type UpcomingCharge = {
  readonly recurrenceId: string;
  readonly description: string;
  readonly date: LocalDate;
  readonly amountCents: number;
};

export type PlanningView = {
  readonly today: LocalDate;
  readonly competence: Competence;
  readonly recurrences: readonly RecurrenceView[];
  readonly projection: readonly MonthProjection[];
  readonly subscriptions: {
    readonly activeCount: number;
    readonly monthlyCents: number;
    readonly yearlyCents: number;
    readonly next7DaysCents: number;
    readonly upcoming: readonly UpcomingCharge[];
  };
  readonly options: {
    readonly accounts: readonly { id: string; name: string }[];
    readonly cards: readonly { id: string; name: string }[];
    readonly categories: readonly { id: string; name: string; kind: "expense" | "income" }[];
  };
};

const PROJECTION_MONTHS = 4;
const UPCOMING_DAYS = 30;

function scheduleLabel(rule: Recurrence): string {
  if (rule.scheduleMode === "business_day_of_month") {
    return `${rule.scheduleDay}º dia útil`;
  }
  const ajuste = rule.dayAdjustment === "previous" ? "dia útil anterior" : "próximo dia útil";
  return `dia ${rule.scheduleDay}, ajustado para o ${ajuste}`;
}

export async function buildPlanningView(userId: string, now: Date = new Date()): Promise<PlanningView> {
  const today = todayIn(now);
  const competence = competenceOf(today);

  const [rules, accounts, cards, categories, entries, confirmedKeys, excludedCategoryIds] = await Promise.all([
    listRecurrences(userId),
    listAccounts(userId),
    listCards(userId),
    listCategories(userId),
    loadLedger(userId),
    confirmedOccurrenceKeys(userId),
    freeToSpendExclusions(userId),
  ]);

  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const cardName = new Map(cards.map((card) => [card.id, card.name]));
  const categoryName = new Map(categories.map((category) => [category.id, category.name]));

  const recurrences: RecurrenceView[] = rules.map((rule) => {
    const proxima = nextOccurrence(rule, today);
    const daCompetencia = occurrencesBetween(rule, competence, competence)[0];
    const jaConfirmada = daCompetencia
      ? confirmedKeys.has(occurrenceKey(rule.id, daCompetencia.competence))
      : true;

    return {
      id: rule.id,
      role: rule.role,
      kind: rule.kind,
      description: rule.description,
      amountCents: rule.amount,
      amountMode: rule.amountMode,
      scheduleLabel: scheduleLabel(rule),
      interval: rule.interval,
      isActive: rule.isActive,
      originName: rule.cardId
        ? (cardName.get(rule.cardId) ?? "Cartão removido")
        : (accountName.get(rule.accountId ?? "") ?? "Conta removida"),
      categoryName: rule.categoryId ? (categoryName.get(rule.categoryId) ?? null) : null,
      next: proxima
        ? { competence: proxima.competence, date: proxima.date, amountCents: proxima.amount }
        : null,
      pending:
        daCompetencia && !jaConfirmada
          ? {
              competence: daCompetencia.competence,
              date: daCompetencia.date,
              amountCents: daCompetencia.amount,
            }
          : null,
    };
  });

  // Projeção: junta o razão real com as ocorrências ainda não confirmadas.
  const cycleByCard = new Map(cards.map((card) => [card.id, card]));
  const projecao = projectRecurrences({
    rules: rules.filter((rule) => rule.isActive),
    from: competence,
    to: shift(competence, PROJECTION_MONTHS),
    confirmedKeys,
    cycleOf: (cardId) => cycleByCard.get(cardId) ?? null,
  });

  const todas = [...entries, ...projecao.entries];
  const contasLiquidas = new Set(liquidAccounts(accounts).map((account) => account.id));
  const categoriaPorLancamento = new Map(projecao.categoryByTransaction);

  const faturasPorMes = projectedInvoicePayments({
    accounts,
    cards,
    entries: todas,
    today,
  });

  const projection: MonthProjection[] = series(competence, PROJECTION_MONTHS + 1).map((mes) => {
    const totais = flow(todas, { accountIds: contasLiquidas, competence: mes, kinds: CONSUMPTION });

    // Gasto de categoria excluída do livre para gastar não pesa como
    // compromisso: é remanejamento de caixa, não consumo.
    const excluido = todas
      .filter(
        (entry) =>
          entry.competence === mes &&
          entry.amount < 0 &&
          entry.party.kind === "account" &&
          contasLiquidas.has(entry.party.accountId) &&
          excludedCategoryIds.has(categoriaPorLancamento.get(entry.transactionId) ?? ""),
      )
      .reduce((soma, entry) => soma - entry.amount, 0);

    // A fatura que vence neste mês também é compromisso: uma assinatura
    // cobrada no cartão não sai da conta na data da cobrança, mas sai quando a
    // fatura vence. Ignorá-la faria a coluna "Comprometido" mentir por baixo.
    const comprometido = totais.outflow - excluido + (faturasPorMes.get(mes) ?? 0);

    return {
      competence: mes,
      businessDays: businessDaysInMonth(competenceYear(mes), competenceMonth(mes)),
      incomeCents: totais.inflow,
      committedCents: comprometido,
      freeCents: totais.inflow - comprometido,
    };
  });

  // Assinaturas
  const assinaturas = rules.filter((rule) => rule.role === "subscription" && rule.isActive);
  const limite = addDays(today, 7);
  const proximasCobrancas: UpcomingCharge[] = assinaturas
    .flatMap((rule) =>
      occurrencesBetween(rule, competence, shift(competence, 2)).map((ocorrencia) => ({
        recurrenceId: rule.id,
        description: rule.description,
        date: ocorrencia.date,
        amountCents: ocorrencia.amount,
      })),
    )
    .filter((cobranca) => cobranca.date >= today && cobranca.date <= addDays(today, UPCOMING_DAYS))
    .sort((left, right) => left.date.localeCompare(right.date));

  const mensal = assinaturas
    .filter((rule) => rule.interval === "monthly")
    .reduce((soma, rule) => soma + occurrenceAmount(rule, competence), 0);
  const anual = assinaturas
    .filter((rule) => rule.interval === "yearly")
    .reduce((soma, rule) => soma + occurrenceAmount(rule, competenceOf(occurrenceDate(rule, competence))), 0);

  return {
    today,
    competence,
    recurrences,
    projection,
    subscriptions: {
      activeCount: assinaturas.length,
      monthlyCents: mensal,
      // Custo anual: doze vezes o que é mensal, mais o que já é anual.
      yearlyCents: mensal * 12 + anual,
      next7DaysCents: proximasCobrancas
        .filter((cobranca) => cobranca.date <= limite)
        .reduce((soma, cobranca) => soma + cobranca.amountCents, 0),
      upcoming: proximasCobrancas,
    },
    options: {
      accounts: accounts.map((account) => ({ id: account.id, name: account.name })),
      cards: cards.filter((card) => card.kind === "credit").map((card) => ({ id: card.id, name: card.name })),
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind,
      })),
    },
  };
}
