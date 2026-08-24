/**
 * Relatórios.
 *
 * Tudo aqui é leitura do razão pelo mesmo domínio que alimenta o painel. Se um
 * número do relatório discordasse do número da Visão geral, um dos dois estaria
 * errado — e o usuário não teria como saber qual.
 */

import { liquidAccounts } from "../../core/domain/account/types.ts";
import { CONSUMPTION, accountBalance, flow } from "../../core/domain/ledger/balance.ts";
import type { LedgerEntry } from "../../core/domain/ledger/types.ts";
import { computeFinancialPosition } from "../../core/domain/position/financial-position.ts";
import type { Cents } from "../../core/kernel/money.ts";
import {
  type Competence,
  competenceOf,
  formatLong as formatCompetence,
  range,
  shift,
} from "../../core/time/competence.ts";
import { type LocalDate, lastDayOfMonth, todayIn } from "../../core/time/local-date.ts";
import { freeToSpendExclusions, listAccounts, listCards, listCategories } from "../repositories/catalog.ts";
import { loadLedger, transactionIndex } from "../repositories/ledger.ts";

/** Períodos oferecidos na tela. `todos` cobre o histórico inteiro. */
export type ReportPeriod = "mes" | "3m" | "6m" | "12m" | "todos";

export const PERIOD_MONTHS: Record<Exclude<ReportPeriod, "todos">, number> = {
  mes: 1,
  "3m": 3,
  "6m": 6,
  "12m": 12,
};

export type MonthlyPoint = {
  readonly competence: Competence;
  readonly incomeCents: number;
  readonly expenseCents: number;
  readonly netCents: number;
  readonly balanceCents: number;
};

export type CategoryBreakdown = {
  readonly categoryId: string | null;
  readonly name: string;
  readonly color: string;
  readonly amountCents: number;
  readonly percent: number;
  readonly transactionCount: number;
};

export type ReportIndicators = {
  readonly incomeCents: number;
  readonly expenseCents: number;
  readonly netCents: number;
  /** Quanto da renda sobrou, em percentual. Negativo quando gastou mais. */
  readonly savingsRatePercent: number;
  readonly averageMonthlyExpenseCents: number;
  readonly investmentsCents: number;
  readonly cardDebtCents: number;
  readonly netWorthCents: number;
  readonly transactionCount: number;
};

export type Report = {
  readonly period: ReportPeriod;
  readonly from: Competence;
  readonly to: Competence;
  readonly today: LocalDate;
  readonly indicators: ReportIndicators;
  readonly monthly: readonly MonthlyPoint[];
  readonly expensesByCategory: readonly CategoryBreakdown[];
  readonly incomeByCategory: readonly CategoryBreakdown[];
  readonly insights: readonly string[];
};

export async function buildReport(
  userId: string,
  period: ReportPeriod = "6m",
  now: Date = new Date(),
): Promise<Report> {
  const today = todayIn(now);
  const to = competenceOf(today);

  const [accounts, cards, categories, entries, index, excluded] = await Promise.all([
    listAccounts(userId),
    listCards(userId),
    listCategories(userId),
    loadLedger(userId),
    transactionIndex(userId),
    freeToSpendExclusions(userId),
  ]);

  const from = resolveStart(period, to, entries);
  const competences = range(from, to);
  const liquidIds = new Set(liquidAccounts(accounts).map((account) => account.id));
  const openingByAccount = new Map(accounts.map((account) => [account.id, account.openingBalance]));

  const monthly: MonthlyPoint[] = competences.map((competence) => {
    const totais = flow(entries, {
      accountIds: liquidIds,
      competence,
      states: ["confirmed"],
      kinds: CONSUMPTION,
    });

    const fimDoMes = lastDayOfMonth(`${competence}-01` as LocalDate);
    const saldo = [...liquidIds].reduce(
      (soma, accountId) =>
        soma + accountBalance(entries, accountId, fimDoMes, (openingByAccount.get(accountId) ?? 0) as Cents),
      0,
    );

    return {
      competence,
      incomeCents: totais.inflow,
      expenseCents: totais.outflow,
      netCents: totais.net,
      balanceCents: saldo,
    };
  });

  const income = monthly.reduce((soma, ponto) => soma + ponto.incomeCents, 0);
  const expense = monthly.reduce((soma, ponto) => soma + ponto.expenseCents, 0);

  const position = computeFinancialPosition({
    accounts,
    cards,
    entries,
    today,
    policy: { excludedCategoryIds: excluded },
  });

  const dentroDoPeriodo = (entry: LedgerEntry) => entry.competence >= from && entry.competence <= to;

  return {
    period,
    from,
    to,
    today,
    indicators: {
      incomeCents: income,
      expenseCents: expense,
      netCents: income - expense,
      savingsRatePercent: income > 0 ? ((income - expense) / income) * 100 : 0,
      averageMonthlyExpenseCents: monthly.length ? Math.round(expense / monthly.length) : 0,
      investmentsCents: position.investments,
      cardDebtCents: position.cardDebt,
      netWorthCents: position.netWorth,
      transactionCount: new Set(
        entries.filter((entry) => dentroDoPeriodo(entry) && entry.state === "confirmed").map((entry) => entry.transactionId),
      ).size,
    },
    monthly,
    expensesByCategory: breakdown(entries, index, categories, from, to, liquidIds, "expense"),
    incomeByCategory: breakdown(entries, index, categories, from, to, liquidIds, "income"),
    insights: buildInsights(monthly, income, expense),
  };
}

/** Começo do período. `todos` recua até a movimentação mais antiga. */
function resolveStart(period: ReportPeriod, to: Competence, entries: readonly LedgerEntry[]): Competence {
  if (period !== "todos") return shift(to, -(PERIOD_MONTHS[period] - 1));
  const mais_antiga = entries.reduce<Competence | null>(
    (menor, entry) => (menor === null || entry.competence < menor ? entry.competence : menor),
    null,
  );
  return mais_antiga ?? to;
}

function breakdown(
  entries: readonly LedgerEntry[],
  index: Awaited<ReturnType<typeof transactionIndex>>,
  categories: Awaited<ReturnType<typeof listCategories>>,
  from: Competence,
  to: Competence,
  accountIds: ReadonlySet<string>,
  kind: "expense" | "income",
): CategoryBreakdown[] {
  const porCategoria = new Map<string | null, { amount: number; transactions: Set<string> }>();

  for (const entry of entries) {
    if (entry.state !== "confirmed" || entry.competence < from || entry.competence > to) continue;
    if (entry.kind !== kind) continue;
    // Compra no crédito não passa por conta, mas é gasto: por isso o filtro de
    // conta só vale para movimentação em conta.
    if (entry.party.kind === "account" && !accountIds.has(entry.party.accountId)) continue;

    const valor = kind === "expense" ? -entry.amount : entry.amount;
    if (valor <= 0) continue;

    const categoryId = index.get(entry.transactionId)?.categoryId ?? null;
    const atual = porCategoria.get(categoryId) ?? { amount: 0, transactions: new Set<string>() };
    atual.amount += valor;
    atual.transactions.add(entry.transactionId);
    porCategoria.set(categoryId, atual);
  }

  const total = [...porCategoria.values()].reduce((soma, item) => soma + item.amount, 0);
  const lookup = new Map(categories.map((category) => [category.id, category]));

  return [...porCategoria.entries()]
    .sort(([, left], [, right]) => right.amount - left.amount)
    .map(([categoryId, item]) => {
      const category = categoryId ? lookup.get(categoryId) : undefined;
      return {
        categoryId,
        name: category?.name ?? "Sem categoria",
        color: category?.color ?? "#6b7280",
        amountCents: item.amount,
        percent: total > 0 ? (item.amount / total) * 100 : 0,
        transactionCount: item.transactions.size,
      };
    });
}

/**
 * Observações derivadas dos próprios números.
 *
 * Nada de conselho genérico: cada frase precisa citar um valor que está na
 * tela, senão vira enfeite que o usuário aprende a ignorar.
 */
function buildInsights(monthly: readonly MonthlyPoint[], income: number, expense: number): string[] {
  const frases: string[] = [];
  if (monthly.length < 2) return frases;

  const formatar = (valor: number) =>
    (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  // O usuário lê "agosto de 2026", não "2026-08" — a competência crua é
  // formato interno e não deveria vazar para uma frase em português.
  const mes = (competence: Competence) => formatCompetence(competence);

  const negativos = monthly.filter((ponto) => ponto.netCents < 0);
  if (negativos.length) {
    frases.push(
      negativos.length === monthly.length
        ? `Todos os ${monthly.length} meses do período fecharam no vermelho.`
        : `${negativos.length} de ${monthly.length} meses fecharam no vermelho.`,
    );
  }

  const maisCaro = [...monthly].sort((left, right) => right.expenseCents - left.expenseCents)[0];
  const media = expense / monthly.length;
  if (maisCaro.expenseCents > media * 1.3) {
    frases.push(
      `${mes(maisCaro.competence)} foi o mês mais caro: ${formatar(maisCaro.expenseCents)}, ${Math.round(
        (maisCaro.expenseCents / media - 1) * 100,
      )}% acima da média.`,
    );
  }

  if (income > 0) {
    const taxa = ((income - expense) / income) * 100;
    frases.push(
      taxa >= 0
        ? `Você guardou ${Math.round(taxa)}% do que entrou — ${formatar(income - expense)} no período.`
        : `Você gastou ${formatar(expense - income)} a mais do que entrou no período.`,
    );
  }

  const primeiro = monthly[0].balanceCents;
  const ultimo = monthly.at(-1)!.balanceCents;
  if (primeiro !== ultimo) {
    frases.push(
      ultimo > primeiro
        ? `Seu saldo cresceu ${formatar(ultimo - primeiro)} desde ${mes(monthly[0].competence)}.`
        : `Seu saldo caiu ${formatar(primeiro - ultimo)} desde ${mes(monthly[0].competence)}.`,
    );
  }

  return frases;
}

/**
 * Exportação em CSV.
 *
 * Ponto e vírgula como separador e vírgula decimal: é o que o Excel em
 * português abre sem pedir configuração.
 */
export function toCsv(report: Report, rows: readonly CategoryBreakdown[]): string {
  const escapar = (valor: string) => `"${valor.replace(/"/g, '""')}"`;
  const dinheiro = (centavos: number) => (centavos / 100).toFixed(2).replace(".", ",");

  return [
    ["categoria", "valor", "percentual", "lancamentos"].join(";"),
    ...rows.map((row) =>
      [escapar(row.name), dinheiro(row.amountCents), row.percent.toFixed(1).replace(".", ","), row.transactionCount].join(";"),
    ),
  ].join("\n");
}
