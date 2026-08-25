/**
 * Os números do aplicativo.
 *
 * Aqui **não existe conta de dinheiro**. O que este arquivo faz é traduzir a
 * linha do banco local para o modelo do domínio e chamar as mesmas funções que
 * o servidor chama: `postTransaction` para virar movimentação, e as consultas
 * de `core/domain/ledger/balance.ts` para virar saldo, fatura e fluxo.
 *
 * Foi assim que a versão anterior errava: o celular somava do seu jeito, o
 * site do dele, e os dois mostravam saldos diferentes para o mesmo dinheiro.
 * Uma regra, uma implementação, dois consumidores.
 *
 * O razão é derivado na leitura em vez de gravado. São centenas ou poucos
 * milhares de lançamentos num aparelho — a soma custa milissegundos, e em
 * troca é impossível o razão local ficar dessincronizado do fato local.
 */

import { activeCompetence, daysUntilClosing, dueDateFor } from "@fluxo/core/domain/card/invoice-cycle.ts";
import {
  CONSUMPTION,
  availableLimit,
  cardDebt,
  committedLimit,
  flow,
  invoiceTotals,
  totalAccountBalance,
} from "@fluxo/core/domain/ledger/balance.ts";
import { postTransaction } from "@fluxo/core/domain/ledger/posting.ts";
import {
  accountParty,
  cardParty,
  type LedgerEntry,
  type Party,
  type Transaction,
} from "@fluxo/core/domain/ledger/types.ts";
import { type Cents, subtract } from "@fluxo/core/kernel/money.ts";
import type { Competence } from "@fluxo/core/time/competence.ts";
import type { LocalDate } from "@fluxo/core/time/local-date.ts";
import type { LocalAccount, LocalCard, LocalTransaction } from "../storage/model.ts";

/**
 * Converte a linha local no lançamento do domínio.
 *
 * Devolve `null` quando a linha não tem origem: acontece com o registro-lápide
 * que marca uma exclusão vinda do servidor. Não é erro — é linha que não
 * representa dinheiro nenhum.
 */
function toTransaction(row: LocalTransaction, userId: string): Transaction | null {
  const origin: Party | null = row.cardId
    ? cardParty(row.cardId)
    : row.accountId
      ? accountParty(row.accountId)
      : null;

  if (!origin) return null;

  const destination: Party | null = row.destinationCardId
    ? cardParty(row.destinationCardId)
    : row.destinationAccountId
      ? accountParty(row.destinationAccountId)
      : null;

  return {
    id: row.id,
    userId,
    kind: row.kind,
    state: row.state,
    source: "manual",
    description: row.description,
    categoryId: row.categoryId,
    amount: row.amount,
    currency: "BRL",
    occurredOn: row.occurredOn,
    origin,
    destination,
    competence: row.competence,
    tripId: row.tripId,
    installmentPlanId: null,
    installmentNumber: row.installmentNumber,
    recurrenceId: null,
    notes: row.notes,
  };
}

/**
 * Materializa o razão a partir dos lançamentos locais.
 *
 * Um lançamento que o domínio recusa (transferência sem destino, valor zero) é
 * **pulado**, não interrompe o cálculo: um único registro estranho vindo de
 * uma versão antiga não pode zerar a tela inteira do usuário. Quantos foram
 * pulados sai junto, para a tela poder avisar em vez de esconder.
 */
export function buildLedger(
  rows: readonly LocalTransaction[],
  userId: string,
): { entries: LedgerEntry[]; skipped: number } {
  const entries: LedgerEntry[] = [];
  let skipped = 0;

  for (const row of rows) {
    const transaction = toTransaction(row, userId);
    if (!transaction) continue;

    try {
      const draft = postTransaction(transaction);
      draft.forEach((entry, indice) => {
        // O identificador da movimentação é derivado, não sorteado: a mesma
        // entrada precisa ter a mesma identidade a cada recálculo.
        entries.push({ ...entry, id: `${transaction.id}:${indice}` });
      });
    } catch {
      skipped += 1;
    }
  }

  return { entries, skipped };
}

export type CardSummary = {
  readonly card: LocalCard;
  readonly competence: Competence;
  readonly dueDate: LocalDate;
  readonly daysToClosing: number;
  readonly charges: Cents;
  readonly payments: Cents;
  readonly outstanding: Cents;
  readonly debt: Cents;
  /** `null` quando o cartão não tem limite cadastrado. */
  readonly available: Cents | null;
};

export type Overview = {
  /** Soma dos saldos confirmados das contas. Dinheiro que existe hoje. */
  readonly balance: Cents;
  /** Dívida de cartão já assumida. Dinheiro que já tem dono. */
  readonly committed: Cents;
  /** Saldo menos comprometido. Nunca apresentado como saldo. */
  readonly free: Cents;
  readonly income: Cents;
  readonly expense: Cents;
  readonly cards: readonly CardSummary[];
  readonly skipped: number;
};

/**
 * O painel inicial.
 *
 * As quatro grandezas ficam separadas de propósito. Patrimônio, saldo atual,
 * comprometido e livre para gastar respondem perguntas diferentes, e misturar
 * duas delas num número só foi o defeito mais caro da versão anterior: o
 * usuário via "disponível" e gastava dinheiro que já era da fatura.
 */
export function overview(input: {
  rows: readonly LocalTransaction[];
  accounts: readonly LocalAccount[];
  cards: readonly LocalCard[];
  userId: string;
  today: LocalDate;
  competence: Competence;
}): Overview {
  const { entries, skipped } = buildLedger(input.rows, input.userId);

  const aberturas = new Map(input.accounts.map((conta) => [conta.id, conta.openingBalance]));
  const balance = totalAccountBalance(entries, aberturas, input.today);

  const cards = input.cards.map((card): CardSummary => {
    const competence = activeCompetence(card, input.today);
    const totais = invoiceTotals(entries, card.id, competence);
    // Zero é "não cadastrado": mostrar "R$ 0,00 disponível" para quem nunca
    // informou o teto seria uma informação falsa, não uma informação faltante.
    const limite = card.limit > 0 ? card.limit : null;

    return {
      card,
      competence,
      dueDate: dueDateFor(card, competence),
      daysToClosing: daysUntilClosing(card, input.today),
      charges: totais.charges,
      payments: totais.payments,
      outstanding: totais.outstanding,
      debt: cardDebt(entries, card.id),
      available: limite === null ? null : availableLimit(entries, card.id, limite),
    };
  });

  const committed = input.cards.reduce<number>(
    (total, card) => total + committedLimit(entries, card.id),
    0,
  ) as Cents;

  const consumo = flow(entries, {
    states: ["confirmed"],
    competence: input.competence,
    kinds: CONSUMPTION,
  });

  return {
    balance,
    committed,
    free: subtract(balance, committed),
    income: consumo.inflow,
    expense: consumo.outflow,
    cards,
    skipped,
  };
}
