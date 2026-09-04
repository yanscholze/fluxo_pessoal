/**
 * Forma dos registros no aparelho.
 *
 * É o **formato do fio** — o mesmo que `serialize` produz em
 * `server/services/sync.ts`. Deliberadamente mais raso que o modelo do
 * domínio: o aparelho guarda o fato do lançamento, e quem deriva razão,
 * fatura e saldo comprometido é o servidor, com o mesmo `core/` que este
 * aplicativo importa.
 */

import type { Cents } from "@fluxo/core/kernel/money.ts";
import type { CycleConfig } from "@fluxo/core/domain/card/invoice-cycle.ts";
import type { TransactionKind, TransactionState } from "@fluxo/core/domain/ledger/types.ts";
import type { Competence } from "@fluxo/core/time/competence.ts";
import type { LocalDate } from "@fluxo/core/time/local-date.ts";

export type LocalAccount = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly currency: string;
  /** Saldo cadastrado da conta antes da primeira movimentação. */
  readonly openingBalance: Cents;
  /** Fora dos totais, a conta não entra em saldo nem em livre para gastar. */
  readonly includeInTotals: boolean;
  readonly color: string | null;
  readonly archivedAt: string | null;
};

export type LocalCategory = {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  /** Marcada para não pesar no livre para gastar. */
  readonly excludeFromFreeToSpend: boolean;
  readonly color: string | null;
  readonly archivedAt: string | null;
};

/** Estende `CycleConfig` para poder ser passado direto ao domínio da fatura. */
export type LocalCard = CycleConfig & {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  /** Teto do cartão. Zero significa "não cadastrado", não "sem limite". */
  readonly limit: Cents;
  /** Define a janela do livre para gastar: do fechamento dele ao seguinte. */
  readonly isPrimary: boolean;
  readonly sortOrder: number;
  readonly color: string | null;
  readonly archivedAt: string | null;
};

export type LocalTransaction = {
  readonly id: string;
  readonly kind: TransactionKind;
  readonly state: TransactionState;
  readonly description: string;
  readonly categoryId: string | null;
  readonly amount: Cents;
  readonly occurredOn: LocalDate;
  readonly competence: Competence;
  readonly accountId: string | null;
  readonly cardId: string | null;
  readonly destinationAccountId: string | null;
  /** Cartão quitado, num pagamento de fatura. */
  readonly destinationCardId: string | null;
  readonly tripId: string | null;
  readonly installmentNumber: number | null;
  readonly notes: string | null;
  /** Versão conhecida no servidor. Zero enquanto o registro nunca subiu. */
  readonly version: number;
  readonly updatedAt: string;
};

/** O que o usuário preenche para registrar um lançamento. */
export type TransactionDraft = {
  readonly kind: TransactionKind;
  readonly description: string;
  readonly amount: Cents;
  readonly occurredOn: LocalDate;
  readonly categoryId: string | null;
  readonly accountId: string | null;
  readonly cardId: string | null;
  readonly destinationAccountId: string | null;
  readonly destinationCardId: string | null;
  /** Fatura quitada, num pagamento de fatura. */
  readonly competence: Competence | null;
  readonly notes: string | null;
};
