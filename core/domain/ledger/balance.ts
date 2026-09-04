/**
 * Consultas sobre o razão.
 *
 * Todo número de dinheiro exibido no Fluxo sai daqui. Saldo não é coluna
 * mantida por delta: é a soma das movimentações. Um saldo errado passa a ser
 * impossível de "desandar" — na pior hipótese é uma movimentação errada, que
 * aparece na extração e pode ser corrigida.
 */

import { type Cents, ZERO, clampToZero, negate, sum } from "../../kernel/money.ts";
import type { Competence } from "../../time/competence.ts";
import type { LocalDate } from "../../time/local-date.ts";
import {
  type LedgerEntry,
  type Party,
  type TransactionKind,
  isProjected,
  isSameParty,
} from "./types.ts";

export type EntryState = LedgerEntry["state"];

/** Critérios de recorte sobre o razão. Campos ausentes não filtram. */
export type EntryFilter = {
  readonly party?: Party;
  readonly accountIds?: ReadonlySet<string>;
  readonly cardIds?: ReadonlySet<string>;
  readonly states?: readonly EntryState[];
  /** Inclui movimentações com data até esta, inclusive. */
  readonly upTo?: LocalDate;
  /** Inclui movimentações a partir desta data, inclusive. */
  readonly from?: LocalDate;
  readonly competence?: Competence;
  /** Natureza do fato de origem. Use para separar consumo de remanejamento. */
  readonly kinds?: readonly TransactionKind[];
  /**
   * Inclui movimentações projetadas — as que não existem como linha no banco.
   *
   * Padrão `false`. Uma consulta só deve pedir projeção quando a pergunta é
   * sobre o **futuro** ("quanto vou gastar"); perguntas sobre o **presente**
   * ("quanto devo", "quanto posso pagar") precisam ficar restritas ao que
   * existe, porque só isso é quitável.
   */
  readonly includeProjected?: boolean;
};

/** Movimentações que representam consumo — o que conta como receita e despesa. */
export const CONSUMPTION: readonly TransactionKind[] = ["expense", "income"];

/** Apenas o que já aconteceu. */
const CONFIRMED: readonly EntryState[] = ["confirmed"];
/** O que aconteceu mais o que está projetado. */
const ALL_STATES: readonly EntryState[] = ["confirmed", "planned"];

export function matches(entry: LedgerEntry, filter: EntryFilter): boolean {
  if (!filter.includeProjected && isProjected(entry)) return false;
  if (filter.party && !isSameParty(entry.party, filter.party)) return false;
  if (filter.accountIds && (entry.party.kind !== "account" || !filter.accountIds.has(entry.party.accountId))) {
    return false;
  }
  if (filter.cardIds && (entry.party.kind !== "card" || !filter.cardIds.has(entry.party.cardId))) return false;
  if (filter.states && !filter.states.includes(entry.state)) return false;
  if (filter.upTo && entry.effectiveOn > filter.upTo) return false;
  if (filter.from && entry.effectiveOn < filter.from) return false;
  if (filter.competence && entry.competence !== filter.competence) return false;
  if (filter.kinds && !filter.kinds.includes(entry.kind)) return false;
  return true;
}

export function select(entries: readonly LedgerEntry[], filter: EntryFilter): LedgerEntry[] {
  return entries.filter((entry) => matches(entry, filter));
}

/** Soma com sinal das movimentações que casam com o filtro. */
export function balance(entries: readonly LedgerEntry[], filter: EntryFilter): Cents {
  let total = 0;
  for (const entry of entries) if (matches(entry, filter)) total += entry.amount;
  return total as Cents;
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

/**
 * Saldo de uma conta na data — só o que já aconteceu.
 *
 * `openingBalance` é o saldo inicial cadastrado da conta. O saldo é sempre
 * "início + movimentações", nunca um número guardado e corrigido por delta.
 */
export function accountBalance(
  entries: readonly LedgerEntry[],
  accountId: string,
  asOf: LocalDate,
  openingBalance: Cents = ZERO,
): Cents {
  return (openingBalance +
    balance(entries, { party: { kind: "account", accountId }, states: CONFIRMED, upTo: asOf })) as Cents;
}

/**
 * Saldo projetado: inclui receitas e despesas previstas até a data.
 *
 * É o "dinheiro futuro" — que **nunca** pode ser apresentado como saldo atual.
 */
export function projectedAccountBalance(
  entries: readonly LedgerEntry[],
  accountId: string,
  asOf: LocalDate,
  openingBalance: Cents = ZERO,
): Cents {
  return (openingBalance +
    balance(entries, {
      party: { kind: "account", accountId },
      states: ALL_STATES,
      upTo: asOf,
      includeProjected: true,
    })) as Cents;
}

/** Soma dos saldos confirmados de um conjunto de contas. */
export function totalAccountBalance(
  entries: readonly LedgerEntry[],
  openingBalances: ReadonlyMap<string, Cents>,
  asOf: LocalDate,
): Cents {
  const accountIds = new Set(openingBalances.keys());
  const opening = sum([...openingBalances.values()]);
  return (opening + balance(entries, { accountIds, states: CONFIRMED, upTo: asOf })) as Cents;
}

// ---------------------------------------------------------------------------
// Cartões e faturas
// ---------------------------------------------------------------------------

/**
 * Resumo de uma fatura.
 *
 * `charges` são as compras da competência; `payments`, o que já foi pago
 * daquela fatura. `outstanding` nunca é negativo — pagar a mais não vira
 * crédito na fatura, vira saldo do cartão.
 */
export type InvoiceTotals = {
  readonly competence: Competence;
  readonly charges: Cents;
  readonly payments: Cents;
  readonly outstanding: Cents;
  readonly isSettled: boolean;
};

export function invoiceTotals(
  entries: readonly LedgerEntry[],
  cardId: string,
  competence: Competence,
  states: readonly EntryState[] = ALL_STATES,
  options: { readonly includeProjected?: boolean } = {},
): InvoiceTotals {
  const rows = select(entries, {
    party: { kind: "card", cardId },
    competence,
    states,
    includeProjected: options.includeProjected ?? false,
  });

  let charges = 0;
  let payments = 0;
  for (const entry of rows) {
    // Compra deixa a dívida mais negativa; pagamento a traz de volta.
    if (entry.amount < 0) charges -= entry.amount;
    else payments += entry.amount;
  }

  const outstanding = clampToZero((charges - payments) as Cents);
  return {
    competence,
    charges: charges as Cents,
    payments: payments as Cents,
    outstanding,
    isSettled: outstanding === 0 && charges > 0,
  };
}

/**
 * Dívida total do cartão: tudo que foi comprado e ainda não foi pago, em
 * qualquer competência. É o passivo que entra no patrimônio.
 */
export function cardDebt(entries: readonly LedgerEntry[], cardId: string): Cents {
  return clampToZero(negate(balance(entries, { party: { kind: "card", cardId }, states: ALL_STATES })));
}

/**
 * Dívida do cartão **até uma data**, só com o que já aconteceu.
 *
 * Diferente de `cardDebt`, que responde "quanto se deve hoje, contando o que
 * já está agendado": aqui a pergunta é histórica — "quanto se devia naquele
 * dia?" —, e por isso a parcela que ainda não venceu fica de fora. É o que
 * permite reconstruir a evolução do patrimônio mês a mês sem misturar dívida
 * realizada com compromisso futuro.
 */
export function cardDebtAsOf(
  entries: readonly LedgerEntry[],
  cardId: string,
  asOf: LocalDate,
): Cents {
  return clampToZero(
    negate(
      balance(entries, {
        party: { kind: "card", cardId },
        states: CONFIRMED,
        upTo: asOf,
      }),
    ),
  );
}

/**
 * Limite comprometido: tudo que o cartão deve, em qualquer competência.
 *
 * Parcelas futuras ocupam limite mesmo sem terem "acontecido", e fatura
 * atrasada continua ocupando — não pagar não devolve limite. Faturas quitadas
 * zeram sozinhas, porque compras e pagamentos se anulam dentro da competência.
 *
 * `fromCompetence` limita o horizonte quando se quer olhar só daqui pra
 * frente; omitido, considera o histórico inteiro, que é o que "limite
 * disponível" significa.
 */
export function committedLimit(
  entries: readonly LedgerEntry[],
  cardId: string,
  fromCompetence?: Competence,
): Cents {
  const byCompetence = new Map<Competence, number>();
  for (const entry of entries) {
    if (isProjected(entry)) continue;
    if (entry.party.kind !== "card" || entry.party.cardId !== cardId) continue;
    if (fromCompetence && entry.competence < fromCompetence) continue;
    byCompetence.set(entry.competence, (byCompetence.get(entry.competence) ?? 0) + entry.amount);
  }
  // Cada fatura contribui no máximo com o que deve; uma paga a mais não abate
  // o limite ocupado por outra.
  let total = 0;
  for (const value of byCompetence.values()) total += Math.max(0, -value);
  return total as Cents;
}

/** Limite ainda disponível para novas compras. */
export function availableLimit(
  entries: readonly LedgerEntry[],
  cardId: string,
  creditLimit: Cents,
  fromCompetence?: Competence,
): Cents {
  return clampToZero((creditLimit - committedLimit(entries, cardId, fromCompetence)) as Cents);
}

/** Competências anteriores à ativa que ainda têm saldo devedor. */
export function overdueCompetences(
  entries: readonly LedgerEntry[],
  cardId: string,
  activeCompetence: Competence,
): Competence[] {
  const competences = new Set<Competence>();
  for (const entry of entries) {
    if (entry.party.kind === "card" && entry.party.cardId === cardId && entry.competence < activeCompetence) {
      competences.add(entry.competence);
    }
  }
  return [...competences]
    .filter((competence) => invoiceTotals(entries, cardId, competence).outstanding > 0)
    .sort();
}

// ---------------------------------------------------------------------------
// Fluxo por período
// ---------------------------------------------------------------------------

export type FlowTotals = {
  readonly inflow: Cents;
  readonly outflow: Cents;
  readonly net: Cents;
};

/**
 * Entradas e saídas de um recorte.
 *
 * Transferência entre contas próprias só se anula quando **as duas pernas**
 * estão no recorte. Ao filtrar por um subconjunto de contas — o caso normal do
 * painel, que olha só as contas de uso corrente — a perna que sobra vira uma
 * saída que nunca foi gasto. Para medir consumo, passe `kinds: CONSUMPTION`.
 */
export function flow(entries: readonly LedgerEntry[], filter: EntryFilter): FlowTotals {
  let inflow = 0;
  let outflow = 0;
  for (const entry of entries) {
    if (!matches(entry, filter)) continue;
    if (entry.amount > 0) inflow += entry.amount;
    else outflow -= entry.amount;
  }
  return { inflow: inflow as Cents, outflow: outflow as Cents, net: (inflow - outflow) as Cents };
}
