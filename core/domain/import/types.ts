/**
 * Importação de extrato e fatura.
 *
 * O pipeline tem estágios separados de propósito:
 *
 * ```
 * arquivo → parser → normalização → duplicidade → transferência →
 * categorização → revisão → confirmação → persistência
 * ```
 *
 * Nada é gravado antes da revisão. Importar direto é como se perde a confiança
 * no extrato: uma linha duplicada ou um pagamento de fatura contado como
 * despesa envenenam todo cálculo daí pra frente, e o usuário não tem como
 * saber de onde veio o número errado.
 */

import type { Cents } from "../../kernel/money.ts";
import type { Competence } from "../../time/competence.ts";
import type { LocalDate } from "../../time/local-date.ts";

export type ImportFormat = "ofx" | "csv";

/** Por que uma linha do arquivo não virou candidata a lançamento. */
export type DiscardReason =
  /** Cabeçalho, rodapé, linha em branco ou separador. */
  | "nao_e_lancamento"
  | "sem_data"
  | "sem_descricao"
  | "sem_valor"
  /**
   * Pagamento de fatura que aparece no extrato do cartão. Importá-lo criaria
   * um crédito na fatura **e** o pagamento já registrado do lado da conta,
   * abatendo a dívida duas vezes.
   */
  | "pagamento_de_fatura"
  /** Estorno ou crédito em contexto de cartão. */
  | "estorno";

export type DiscardedRow = {
  readonly reason: DiscardReason;
  readonly rawText: string;
};

/**
 * Linha extraída do arquivo, antes de qualquer decisão de negócio.
 *
 * `amount` é **com sinal**, como o arquivo traz: negativo é saída. A conversão
 * para o modelo do Fluxo (valor sempre positivo + tipo) acontece na
 * normalização, não aqui.
 */
export type ParsedRow = {
  /** `FITID` no OFX. O emissor garante estabilidade; use como identidade. */
  readonly externalId: string | null;
  readonly date: LocalDate;
  readonly description: string;
  readonly amount: Cents;
  /** Trecho original, para o usuário conferir na revisão. */
  readonly rawText: string;
  /** Parcela declarada no arquivo (`3/10`, `parcela 3 de 10`). */
  readonly installment: { readonly current: number; readonly total: number } | null;
};

export type ParseResult = {
  readonly format: ImportFormat;
  readonly rows: readonly ParsedRow[];
  readonly discarded: readonly DiscardedRow[];
};

/** Para onde o arquivo está sendo importado. Muda as regras de descarte. */
export type ImportTarget =
  | { readonly kind: "account"; readonly accountId: string }
  | {
      readonly kind: "card";
      readonly cardId: string;
      /** Competência da fatura que o arquivo representa. */
      readonly competence: Competence;
    };

/** Veredito de duplicidade de uma linha. */
export type DuplicateVerdict = "novo" | "duplicado";

/** Situação de uma linha na revisão. */
export type ReviewVerdict = "novo" | "duplicado" | "possivel_transferencia" | "sem_categoria";

export type ReviewItem = {
  readonly row: ParsedRow;
  readonly fingerprint: string;
  readonly verdict: ReviewVerdict;
  /** Tipo inferido a partir do sinal e do contexto. */
  readonly kind: "expense" | "income";
  readonly suggestedCategoryId: string | null;
  /** Conta do outro lado, quando a linha parece uma transferência interna. */
  readonly transferCounterpartId: string | null;
  /** Decisão do usuário. `pendente` até ele revisar. */
  readonly decision: "pendente" | "aceitar" | "ignorar";
};

/** Contagens que a tela de revisão mostra antes de confirmar. */
export type ImportSummary = {
  readonly found: number;
  readonly fresh: number;
  readonly duplicates: number;
  readonly withoutCategory: number;
  readonly possibleTransfers: number;
  readonly discarded: number;
};

export function summarize(items: readonly ReviewItem[], discarded: readonly DiscardedRow[]): ImportSummary {
  return {
    found: items.length + discarded.length,
    fresh: items.filter((item) => item.verdict === "novo" || item.verdict === "sem_categoria").length,
    duplicates: items.filter((item) => item.verdict === "duplicado").length,
    withoutCategory: items.filter((item) => item.suggestedCategoryId === null).length,
    possibleTransfers: items.filter((item) => item.verdict === "possivel_transferencia").length,
    discarded: discarded.length,
  };
}
