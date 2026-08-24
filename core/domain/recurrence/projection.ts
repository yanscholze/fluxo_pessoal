/**
 * Projeção de recorrências no razão.
 *
 * Cada ocorrência vira um lançamento **virtual** — existe só em memória, para
 * o cálculo de projeção e de livre para gastar. Ele passa pelas mesmas regras
 * de postagem de um lançamento real, então não há um segundo jeito de decidir
 * o que uma despesa recorrente faz com o dinheiro.
 *
 * Quando o usuário confirma que a ocorrência aconteceu, ela vira linha no
 * banco e a virtual some — a chave de idempotência garante que as duas nunca
 * coexistam.
 */

import { newId } from "../../kernel/id.ts";
import type { Competence } from "../../time/competence.ts";
import type { CycleConfig } from "../card/invoice-cycle.ts";
import { competenceForPurchase } from "../card/invoice-cycle.ts";
import { postTransaction } from "../ledger/posting.ts";
import { type LedgerEntry, type Transaction, accountParty, cardParty } from "../ledger/types.ts";
import { type Occurrence, type Recurrence, occurrenceKey, projectOccurrences } from "./schedule.ts";

/** Prefixo que marca uma linha que não existe no banco. */
const VIRTUAL_PREFIX = "virtual:";

export function isVirtual(transactionId: string): boolean {
  return transactionId.startsWith(VIRTUAL_PREFIX);
}

/**
 * Lançamento virtual de uma ocorrência.
 *
 * O identificador é derivado da chave da ocorrência, não sorteado: assim a
 * mesma projeção recalculada duas vezes produz as mesmas linhas, e a interface
 * não pisca ao revalidar.
 */
export function occurrenceToTransaction(
  rule: Recurrence,
  occurrence: Occurrence,
  cycleOf?: (cardId: string) => CycleConfig | null,
): Transaction | null {
  const cycle = rule.cardId ? (cycleOf?.(rule.cardId) ?? null) : null;

  // Recorrência no cartão sem cartão resolvível não vira nada. Adivinhar qual
  // cartão era foi o que a versão anterior fazia — e errava assim que existia
  // um segundo cartão.
  if (rule.cardId && !cycle) return null;

  const origin = rule.cardId ? cardParty(rule.cardId) : rule.accountId ? accountParty(rule.accountId) : null;
  if (!origin) return null;

  const competence: Competence =
    rule.cardId && cycle ? competenceForPurchase(cycle, occurrence.date) : occurrence.competence;

  const destination =
    rule.kind === "transfer" && rule.destinationAccountId ? accountParty(rule.destinationAccountId) : null;

  if (rule.kind === "transfer" && !destination) return null;

  return {
    id: `${VIRTUAL_PREFIX}${occurrenceKey(rule.id, occurrence.competence)}`,
    userId: rule.userId,
    kind: rule.kind,
    // Projeção nunca move saldo: entra como previsto.
    state: "planned",
    source: "recurrence",
    description: rule.description,
    categoryId: rule.kind === "transfer" ? null : rule.categoryId,
    amount: occurrence.amount,
    currency: "BRL",
    occurredOn: occurrence.date,
    origin,
    destination,
    competence,
    tripId: null,
    installmentPlanId: null,
    installmentNumber: null,
    recurrenceId: rule.id,
    notes: null,
  };
}

export type ProjectionInput = {
  readonly rules: readonly Recurrence[];
  readonly from: Competence;
  readonly to: Competence;
  /**
   * Chaves de ocorrências que já viraram lançamento real. Sem isso, o salário
   * confirmado apareceria duas vezes: uma como linha no banco e outra como
   * projeção.
   */
  readonly confirmedKeys: ReadonlySet<string>;
  readonly cycleOf?: (cardId: string) => CycleConfig | null;
};

export type Projection = {
  readonly transactions: readonly Transaction[];
  readonly entries: readonly LedgerEntry[];
  /** Categoria de cada lançamento virtual, para a política de livre para gastar. */
  readonly categoryByTransaction: ReadonlyMap<string, string | null>;
};

export function projectRecurrences(input: ProjectionInput): Projection {
  const transactions: Transaction[] = [];

  for (const rule of input.rules) {
    for (const occurrence of projectOccurrences([rule], input.from, input.to)) {
      if (input.confirmedKeys.has(occurrenceKey(rule.id, occurrence.competence))) continue;
      const transaction = occurrenceToTransaction(rule, occurrence, input.cycleOf);
      if (transaction) transactions.push(transaction);
    }
  }

  const entries: LedgerEntry[] = transactions.flatMap((transaction) =>
    postTransaction(transaction).map((draft) => ({ ...draft, id: newId() })),
  );

  return {
    transactions,
    entries,
    categoryByTransaction: new Map(
      transactions.map((transaction) => [transaction.id, transaction.categoryId]),
    ),
  };
}
