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
 * Descreve a natureza da conta. A escolha de usar seu saldo no "livre para
 * gastar" é independente: um investimento pode guardar dinheiro do dia a dia,
 * e uma conta corrente pode manter uma reserva que não deve ser gasta.
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
  /**
   * Escolha explícita de incluir o saldo e as previsões no livre para gastar.
   * Ausente em dados antigos: preserva a seleção histórica pelo tipo da conta.
   * Não substitui includeInTotals, moeda ou estado de arquivamento.
   */
  readonly includeInFreeToSpend?: boolean;
  /** Conta protegida não pode ser excluída (ex.: a reserva de emergência). */
  readonly isProtected: boolean;
  readonly color: string;
  readonly sortOrder: number;
  readonly archivedAt: string | null;
};

/** Padrão histórico, usado apenas quando não há uma escolha explícita. */
const SPENDABLE_KINDS: readonly AccountKind[] = ["checking", "cash", "benefit"];

export function includesInFreeToSpend(account: Pick<Account, "kind" | "includeInFreeToSpend">): boolean {
  return account.includeInFreeToSpend ?? SPENDABLE_KINDS.includes(account.kind);
}

export function isSpendable(account: Account): boolean {
  return includesInFreeToSpend(account);
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
 * Usa a escolha de cada conta, mantendo o recorte por reais, participação nos
 * totais e estado ativo. Dados antigos sem a escolha mantêm o padrão pelo tipo.
 */
export function liquidAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter(
    (account) => isActive(account) && account.includeInTotals && account.currency === "BRL" && isSpendable(account),
  );
}

/**
 * Contas de dinheiro e contas de benefício, separadas.
 *
 * São bolsos com regras próprias: o vale tem competência e destino próprios, e
 * o saldo de um não cobre o compromisso do outro. Misturá-los num total só era
 * o que fazia o "livre para gastar" prometer mais do que existe.
 */
export function moneyAccounts(accounts: readonly Account[]): Account[] {
  return liquidAccounts(accounts).filter((account) => account.kind !== "benefit");
}

export function benefitAccounts(accounts: readonly Account[]): Account[] {
  return liquidAccounts(accounts).filter((account) => account.kind === "benefit");
}

/** Contas que somam no patrimônio, incluindo reservas e investimentos. */
export function assetAccounts(accounts: readonly Account[]): Account[] {
  return accounts.filter((account) => isActive(account) && account.includeInTotals);
}

export function openingBalancesOf(accounts: readonly Account[]): Map<string, Cents> {
  return new Map(accounts.map((account) => [account.id, account.openingBalance]));
}
