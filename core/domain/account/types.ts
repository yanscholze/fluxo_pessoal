/**
 * Contas.
 *
 * Uma conta guarda dinheiro. Seu saldo **não** é um campo: é o saldo inicial
 * mais as movimentações do razão. O que fica aqui é o cadastro — o que a conta
 * é, e como ela participa dos totais.
 */

import type { Cents } from "../../kernel/money.ts";
import type { LocalDate } from "../../time/local-date.ts";

/**
 * Natureza da conta.
 *
 * A distinção que importa é entre **gastável** e **reservado**: investimento é
 * patrimônio, mas não é dinheiro pensado para gastar, e por isso não entra no
 * "livre para gastar".
 */
export type AccountKind = "checking" | "savings" | "cash" | "benefit" | "investment";

/** Moedas aceitas em conta. */
export const SUPPORTED_CURRENCIES = ["BRL", "USD", "EUR", "GBP", "ARS", "CAD", "JPY", "CHF"] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}

export type Account = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly institution: string;
  readonly kind: AccountKind;
  readonly currency: CurrencyCode;
  /** Saldo com que a conta entrou no Fluxo. Ponto de partida do razão. */
  readonly openingBalance: Cents;
  readonly openedOn: LocalDate;
  /** Meta de reserva, quando houver. */
  readonly goalAmount: Cents | null;
  /** Rendimento esperado ao mês, em pontos-base (100 = 1,00%). */
  readonly monthlyYieldBasisPoints: number;
  /**
   * Quando falso, a conta fica fora de "saldo total", "patrimônio" e "livre
   * para gastar". Serve para contas usadas só como anotação.
   */
  readonly includeInTotals: boolean;
  /** Conta protegida não pode ser excluída (ex.: a reserva de emergência). */
  readonly isProtected: boolean;
  readonly color: string;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
};

/** Contas cujo dinheiro está disponível para gastar no dia a dia. */
const SPENDABLE_KINDS: readonly AccountKind[] = ["checking", "cash", "benefit"];

export function isSpendable(account: Account): boolean {
  return SPENDABLE_KINDS.includes(account.kind);
}

export function isInvestment(account: Account): boolean {
  return account.kind === "investment" || account.kind === "savings";
}

export function isActive(account: Account): boolean {
  return account.archivedAt === null;
}

/**
 * Contas que compõem o "saldo líquido" — a base do livre para gastar.
 *
 * Só conta corrente, dinheiro e benefício, em reais, marcadas para entrar nos
 * totais e não arquivadas. Poupança e investimento ficam de fora de propósito.
 */
export function liquidAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter(
    (account) => isActive(account) && account.includeInTotals && account.currency === "BRL" && isSpendable(account),
  );
}

/** Contas que somam no patrimônio, incluindo reservas e investimentos. */
export function assetAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter((account) => isActive(account) && account.includeInTotals);
}

export function openingBalancesOf(accounts: readonly Account[]): Map<string, Cents> {
  return new Map(accounts.map((account) => [account.id, account.openingBalance]));
}
