/**
 * Serviço de contas e patrimônio.
 *
 * Saldo aqui é sempre o de **hoje** — dinheiro que existe. O que ainda vai
 * entrar aparece separado, como projeção. Misturar os dois é o erro que faz
 * alguém gastar dinheiro que ainda não recebeu.
 */

import { liquidAccounts } from "../../core/domain/account/types.ts";
import { CONSUMPTION, accountBalance, flow, projectedAccountBalance } from "../../core/domain/ledger/balance.ts";
import type { Cents } from "../../core/kernel/money.ts";
import { type Competence, competenceOf, range, shift } from "../../core/time/competence.ts";
import { type LocalDate, lastDayOfMonth, todayIn } from "../../core/time/local-date.ts";
import { listAccounts } from "../repositories/catalog.ts";
import { loadLedger } from "../repositories/ledger.ts";

export type AccountView = {
  readonly id: string;
  readonly name: string;
  readonly institution: string;
  readonly kind: string;
  readonly currency: string;
  readonly color: string;
  readonly includeInTotals: boolean;
  readonly isProtected: boolean;
  readonly balanceCents: number;
  /** Saldo somando o que já está previsto até o fim do mês. */
  readonly projectedCents: number;
  readonly goalCents: number | null;
  readonly goalPercent: number | null;
  readonly monthlyYieldBasisPoints: number;
  /** Rendimento esperado no mês, dado o saldo atual. */
  readonly expectedYieldCents: number;
  readonly inflowCents: number;
  readonly outflowCents: number;
};

export type NetWorthPoint = {
  readonly competence: Competence;
  readonly balanceCents: number;
};

export type AccountsView = {
  readonly today: LocalDate;
  readonly competence: Competence;
  readonly accounts: readonly AccountView[];
  readonly totals: {
    /** Contas de uso corrente em reais. */
    readonly spendableCents: number;
    /** Reservas e investimentos em reais. */
    readonly investedCents: number;
    readonly totalCents: number;
    /** Saldos que não entram no total por serem de outra moeda. */
    readonly byForeignCurrency: readonly { currency: string; balanceCents: number }[];
  };
  /** Evolução do patrimônio nos últimos meses. */
  readonly history: readonly NetWorthPoint[];
};

const HISTORY_MONTHS = 11;

export async function buildAccountsView(userId: string, now: Date = new Date()): Promise<AccountsView> {
  const today = todayIn(now);
  const competence = competenceOf(today);

  const [accounts, entries] = await Promise.all([listAccounts(userId), loadLedger(userId)]);
  const fimDoMes = lastDayOfMonth(today);

  const views: AccountView[] = accounts.map((account) => {
    const saldo = accountBalance(entries, account.id, today, account.openingBalance);
    const periodo = flow(entries, {
      party: { kind: "account", accountId: account.id },
      competence,
      states: ["confirmed"],
      kinds: CONSUMPTION,
    });

    return {
      id: account.id,
      name: account.name,
      institution: account.institution,
      kind: account.kind,
      currency: account.currency,
      color: account.color,
      includeInTotals: account.includeInTotals,
      isProtected: account.isProtected,
      balanceCents: saldo,
      projectedCents: projectedAccountBalance(entries, account.id, fimDoMes, account.openingBalance),
      goalCents: account.goalAmount,
      goalPercent:
        account.goalAmount && account.goalAmount > 0
          ? Math.min(100, (saldo / account.goalAmount) * 100)
          : null,
      monthlyYieldBasisPoints: account.monthlyYieldBasisPoints,
      // Estimativa simples: o rendimento do mês sobre o saldo de hoje. Não
      // promete retorno — é a expectativa que o usuário cadastrou.
      expectedYieldCents: Math.round((saldo * account.monthlyYieldBasisPoints) / 10_000),
      inflowCents: periodo.inflow,
      outflowCents: periodo.outflow,
    };
  });

  const emReais = accounts.filter((account) => account.currency === "BRL" && account.includeInTotals);
  const liquidIds = new Set(liquidAccounts(accounts).map((account) => account.id));

  const spendable = views
    .filter((view) => liquidIds.has(view.id))
    .reduce((soma, view) => soma + view.balanceCents, 0);
  const invested = emReais
    .filter((account) => !liquidIds.has(account.id))
    .reduce((soma, account) => soma + (views.find((view) => view.id === account.id)?.balanceCents ?? 0), 0);

  const porMoeda = new Map<string, number>();
  for (const view of views) {
    if (view.currency === "BRL" || !view.includeInTotals) continue;
    porMoeda.set(view.currency, (porMoeda.get(view.currency) ?? 0) + view.balanceCents);
  }

  const idsEmReais = new Set(emReais.map((account) => account.id));
  const openingByAccount = new Map(accounts.map((account) => [account.id, account.openingBalance]));

  return {
    today,
    competence,
    accounts: views,
    totals: {
      spendableCents: spendable,
      investedCents: invested,
      totalCents: spendable + invested,
      byForeignCurrency: [...porMoeda.entries()].map(([currency, balanceCents]) => ({ currency, balanceCents })),
    },
    history: range(shift(competence, -HISTORY_MONTHS), competence).map((mes) => ({
      competence: mes,
      balanceCents: [...idsEmReais].reduce(
        (soma, accountId) =>
          soma +
          accountBalance(
            entries,
            accountId,
            lastDayOfMonth(`${mes}-01` as LocalDate),
            (openingByAccount.get(accountId) ?? 0) as Cents,
          ),
        0,
      ),
    })),
  };
}
