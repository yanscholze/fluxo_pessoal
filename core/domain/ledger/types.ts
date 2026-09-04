/**
 * Tipos do razão.
 *
 * O razão é a fonte única de verdade sobre dinheiro. Um **lançamento**
 * (`Transaction`) é o fato que o usuário registra; as **movimentações**
 * (`LedgerEntry`) são o efeito desse fato sobre contas e cartões. Saldo,
 * fatura, patrimônio, comprometido e projeção são todos consultas sobre
 * movimentações — nunca colunas mantidas à mão.
 */

import type { Cents } from "../../kernel/money.ts";
import type { Competence } from "../../time/competence.ts";
import type { LocalDate } from "../../time/local-date.ts";

/** Onde o dinheiro está: numa conta (ativo) ou num cartão (passivo). */
export type Party =
  | { readonly kind: "account"; readonly accountId: string }
  | { readonly kind: "card"; readonly cardId: string };

export function accountParty(accountId: string): Party {
  return { kind: "account", accountId };
}

export function cardParty(cardId: string): Party {
  return { kind: "card", cardId };
}

export function isSameParty(left: Party, right: Party): boolean {
  if (left.kind !== right.kind) return false;
  return left.kind === "account" && right.kind === "account"
    ? left.accountId === right.accountId
    : left.kind === "card" && right.kind === "card"
      ? left.cardId === right.cardId
      : false;
}

/**
 * Natureza do lançamento.
 *
 * `invoice_payment` é separado de `transfer` porque tem regra própria: reduz
 * a dívida de um cartão numa competência específica e **não é despesa**.
 * Contabilizá-lo como gasto duplicaria as compras já registradas na fatura.
 */
export type TransactionKind = "expense" | "income" | "transfer" | "invoice_payment";

/**
 * Situação do lançamento.
 *
 * - `confirmed` aconteceu e move saldo.
 * - `planned` é projeção (recorrência futura, parcela a vencer) e não move
 *   saldo — mas conta como compromisso.
 * - `review` é captura automática aguardando decisão: não move saldo e não
 *   conta como compromisso, porque ainda pode ser descartada.
 */
export type TransactionState = "confirmed" | "planned" | "review";

/** De onde veio o lançamento. Só informativo — não altera cálculo. */
export type TransactionSource =
  | "manual"
  | "import"
  | "recurrence"
  | "installment"
  | "invoice_payment"
  | "capture";

export type Transaction = {
  readonly id: string;
  readonly userId: string;
  readonly kind: TransactionKind;
  readonly state: TransactionState;
  readonly source: TransactionSource;
  readonly description: string;
  readonly categoryId: string | null;
  /** Sempre positivo. O sinal do dinheiro vem de `kind`, nunca do valor. */
  readonly amount: Cents;
  readonly currency: string;
  /** Data do fato. */
  readonly occurredOn: LocalDate;
  /** Onde o dinheiro sai. Numa receita, é onde ele entra. */
  readonly origin: Party;
  /** Para onde vai. Preenchido em transferência e pagamento de fatura. */
  readonly destination: Party | null;
  /**
   * Competência. Em compra no crédito é a fatura em que cai; nos demais casos,
   * o mês da data. Calculada na criação e persistida — consultar fatura não
   * pode depender de recalcular o ciclo de cada cartão a cada leitura.
   */
  readonly competence: Competence;
  readonly tripId: string | null;
  readonly installmentPlanId: string | null;
  /** 1-based. `null` quando não é parcela. Nunca o texto "3/12". */
  readonly installmentNumber: number | null;
  readonly recurrenceId: string | null;
  readonly notes: string | null;
};

/**
 * Movimentação de dinheiro.
 *
 * O valor é **com sinal**: positivo entra, negativo sai. Para cartão, negativo
 * significa dívida maior. Movimentações são imutáveis — editar um lançamento
 * apaga as dele e gera outras, na mesma transação de banco.
 */
export type LedgerEntry = {
  readonly id: string;
  readonly userId: string;
  readonly transactionId: string;
  readonly party: Party;
  readonly amount: Cents;
  /** Data em que o dinheiro se move. */
  readonly effectiveOn: LocalDate;
  readonly competence: Competence;
  /** Espelha a situação do lançamento; `review` nunca gera movimentação. */
  readonly state: Exclude<TransactionState, "review">;
  /**
   * Natureza do fato que originou a movimentação.
   *
   * Sem isto, uma consulta de "quanto gastei" não consegue distinguir a perna
   * de saída de uma transferência de uma despesa de verdade, e passa a contar
   * como gasto o dinheiro que só mudou de conta.
   */
  readonly kind: TransactionKind;
};

/** Movimentação ainda sem identidade, como sai das regras de postagem. */
export type DraftLedgerEntry = Omit<LedgerEntry, "id">;

// ---------------------------------------------------------------------------
// Projeção
// ---------------------------------------------------------------------------

/**
 * Prefixo do identificador de um lançamento que **não existe no banco**.
 *
 * Mora aqui, e não no módulo de recorrência, porque a distinção é do razão:
 * consultas sobre movimentações precisam saber se estão olhando um fato ou uma
 * previsão, e a de recorrência é só uma das origens possíveis de previsão.
 */
export const VIRTUAL_PREFIX = "virtual:";

export function isVirtual(transactionId: string): boolean {
  return transactionId.startsWith(VIRTUAL_PREFIX);
}

/**
 * A movimentação veio de uma projeção calculada, não de uma linha do banco.
 *
 * A diferença importa sempre que a resposta precisa ser **acionável**. Uma
 * cobrança projetada não pode compor o saldo devedor de uma fatura: não existe
 * lançamento para quitar, então o pagamento nunca a cobre e a fatura fica
 * eternamente com um resíduo que o usuário não tem como zerar.
 */
export function isProjected(entry: LedgerEntry): boolean {
  return isVirtual(entry.transactionId);
}

