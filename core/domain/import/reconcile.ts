/**
 * Conciliação entre arquivos.
 *
 * O resto do pipeline de importação olha um arquivo por vez, e é isso que o
 * torna incapaz de importar um extrato de verdade. Metade dos fatos que
 * importam só existe no **encontro** de dois arquivos:
 *
 * - o pagamento de fatura é um débito no extrato da conta e um crédito na
 *   fatura do cartão. Importados em separado, viram duas coisas erradas: uma
 *   despesa que duplica as compras já lançadas, e um crédito órfão;
 * - a aplicação na caixinha é um débito na conta e não é despesa nenhuma — o
 *   dinheiro mudou de bolso. O outro lado não aparece em arquivo algum, porque
 *   a caixinha não exporta extrato;
 * - o estorno de uma compra pode cair numa fatura diferente da compra que ele
 *   devolve.
 *
 * Este módulo recebe **todos** os arquivos de uma vez e devolve lançamentos já
 * conciliados, no vocabulário do razão (`expense`, `income`, `transfer`,
 * `invoice_payment`, `refund`).
 *
 * Duas promessas guiam o desenho:
 *
 * 1. **Nada some em silêncio.** Toda linha de entrada termina em exatamente um
 *    lugar do resultado: virou lançamento, foi anulada por um par, ou está em
 *    `unmatched` pedindo olho humano. `assertComplete` prova isso.
 * 2. **O arquivo é a testemunha.** O `LEDGERBAL` de cada extrato confere o que
 *    foi conciliado. Se a conta não fecha, o resultado diz onde.
 */

import { type Cents, cents } from "../../kernel/money.ts";
import type { Competence } from "../../time/competence.ts";
import type { LocalDate } from "../../time/local-date.ts";
import type { ImportTarget, ParseResult, ParsedRow } from "./types.ts";

// --- entrada -----------------------------------------------------------------

/** Um arquivo já parseado, com o alvo a que ele pertence. */
export type StatementSource = {
  /** Nome do arquivo, para o usuário localizar o problema que for relatado. */
  readonly label: string;
  readonly target: ImportTarget;
  readonly parsed: ParseResult;
};

/** Uma conta do próprio usuário fora deste banco, reconhecida pela descrição. */
export type OwnAccountRule = {
  readonly match: string;
  readonly accountId: string;
};

export type ReconcileConfig = {
  readonly accountId: string;
  readonly cardId: string;
  /**
   * Conta que representa a caixinha.
   *
   * Ela precisa existir no Fluxo mesmo sem extrato próprio: sem um destino, a
   * aplicação vira despesa e o resgate vira receita, e o patrimônio do usuário
   * desaparece do app enquanto a renda e o gasto do mês incham.
   */
  readonly investmentAccountId: string;
  readonly ownExternalAccounts: readonly OwnAccountRule[];
  /**
   * Saldo da conta imediatamente antes do primeiro arquivo.
   *
   * O `LEDGERBAL` é acumulado: ele já embute tudo que aconteceu antes do
   * período exportado. Sem informar a abertura, todo arquivo fecha errado pelo
   * mesmo valor — e é fácil confundir esse desvio constante com um erro de
   * conciliação. Quando ausente, vale zero.
   */
  readonly openingAccountBalance?: Cents;
  /** Dívida do cartão antes da primeira fatura exportada. */
  readonly openingCardBalance?: Cents;
};

// --- saída -------------------------------------------------------------------

export type ReconciledEntry = {
  readonly kind: "expense" | "income" | "transfer" | "invoice_payment" | "refund";
  readonly description: string;
  /** Sempre positivo: o sinal vive no `kind`, como no razão. */
  readonly amount: Cents;
  readonly occurredOn: LocalDate;
  /** Origem: conta para quase tudo, cartão para compra no crédito e estorno. */
  readonly origin: { readonly kind: "account" | "card"; readonly id: string };
  readonly destination?: { readonly kind: "account" | "card"; readonly id: string };
  /** Competência da fatura, quando o lançamento pertence a uma. */
  readonly competence?: Competence;
  readonly installment?: { readonly current: number; readonly total: number };
  /**
   * `FITID` da linha que originou o lançamento, quando havia.
   *
   * Não serve de identidade sozinho — o emissor reusa o mesmo número entre as
   * parcelas, o estorno e o IOF de uma compra —, mas é exatamente por isso que
   * ele é útil aqui: é o que agrupa as parcelas de uma mesma compra para saber
   * quantas ainda faltam.
   */
  readonly externalId: string | null;
  readonly fingerprintSeed: string;
  readonly source: string;
};

/** Duas linhas que se anulam e por isso não viram lançamento nenhum. */
export type CancelledPair = {
  readonly reason: "estorno_total" | "aplicacao_devolvida" | "pix_estornado" | "iof_devolvido";
  readonly debit: ParsedRow;
  readonly credit: ParsedRow;
  readonly source: string;
};

/** Linha que parecia ter par e não tem. Nunca é descartada em silêncio. */
export type UnmatchedRow = {
  readonly row: ParsedRow;
  readonly expected: string;
  readonly source: string;
};

export type BalanceCheck = {
  readonly source: string;
  readonly declared: Cents;
  readonly reconciled: Cents;
  readonly matches: boolean;
};

export type ReconcileResult = {
  readonly entries: readonly ReconciledEntry[];
  readonly cancelled: readonly CancelledPair[];
  readonly unmatched: readonly UnmatchedRow[];
  readonly balances: readonly BalanceCheck[];
};

// --- reconhecimento de texto -------------------------------------------------

function flat(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Débito na conta que quita a fatura do cartão. */
const INVOICE_PAYMENT_ACCOUNT = /^pagamento de fatura/;
/** Crédito na fatura que corresponde a esse débito. */
const INVOICE_PAYMENT_CARD = /pagamento recebido/;

/**
 * Aplicação e resgate da caixinha.
 *
 * `RDB` é como o Nubank nomeia o papel que lastreia a caixinha. O texto é
 * exatamente `Aplicação RDB` / `Resgate RDB`, sem contraparte nem valor no
 * meio — âncora nas duas pontas evita que uma transferência para terceiro cujo
 * nome contenha "resgate" seja confundida com movimento de investimento.
 */
const INVESTMENT_APPLY = /^aplicacao rdb$/;
const INVESTMENT_REDEEM = /^resgate rdb$/;
/** Aplicação que o banco tentou e devolveu no mesmo dia. */
const INVESTMENT_FAILED = /^aplicacao em investimento$/;
const INVESTMENT_RETURNED = /^devolucao - aplicacao em investimento$/;

/** Estorno de Pix na conta: o FITID do estorno é o do original + `:reversal`. */
const REVERSAL_SUFFIX = ":reversal";

/** IOF devolvido, que não compartilha FITID com o IOF cobrado. */
const IOF_RETURNED = /^iof de volta de /;
const IOF_CHARGED = /^iof de compra internacional$/;

// --- conciliação -------------------------------------------------------------

type Tagged = {
  readonly row: ParsedRow;
  readonly source: string;
  readonly target: ImportTarget;
  /** Verdadeiro quando o parser já tinha separado a linha do fluxo normal. */
  readonly discarded: boolean;
};

function collect(sources: readonly StatementSource[], card: boolean): Tagged[] {
  const wanted = sources.filter((source) => (source.target.kind === "card") === card);
  return wanted.flatMap((source) => [
    ...source.parsed.rows.map((row) => ({ row, source: source.label, target: source.target, discarded: false })),
    ...source.parsed.discarded
      .filter((entry): entry is typeof entry & { row: ParsedRow } => entry.row !== undefined)
      .map((entry) => ({ row: entry.row, source: source.label, target: source.target, discarded: true })),
  ]);
}

function competenceOfTarget(target: ImportTarget): Competence | undefined {
  return target.kind === "card" ? target.competence : undefined;
}

/**
 * Semente da identidade do lançamento conciliado.
 *
 * Não é o fingerprint final — quem grava decide o escopo —, mas carrega o que
 * distingue esta linha de qualquer outra: alvo, `FITID`, descrição, valor e
 * parcela. É o mesmo conjunto que `fingerprint.ts` usa, e pelo mesmo motivo: o
 * Nubank reusa `FITID` entre parcelas, estorno e IOF da mesma compra.
 */
function seedOf(tagged: Tagged): string {
  const scope = tagged.target.kind === "card" ? `card|${tagged.target.cardId}` : `account|${tagged.target.accountId}`;
  const parts = [scope, tagged.row.externalId ?? "-", flat(tagged.row.description), String(tagged.row.amount)];
  if (tagged.row.installment) parts.push(`${tagged.row.installment.current}/${tagged.row.installment.total}`);
  return parts.join("|");
}

export function reconcile(sources: readonly StatementSource[], config: ReconcileConfig): ReconcileResult {
  const entries: ReconciledEntry[] = [];
  const cancelled: CancelledPair[] = [];
  const unmatched: UnmatchedRow[] = [];

  const accountRows = collect(sources, false);
  const cardRows = collect(sources, true);
  const consumed = new Set<Tagged>();

  const take = (tagged: Tagged): boolean => {
    if (consumed.has(tagged)) return false;
    consumed.add(tagged);
    return true;
  };

  // --- 1. pagamento de fatura ------------------------------------------------
  // Primeiro de todos porque consome linhas dos dois lados: deixar para depois
  // faria o débito da conta já ter virado despesa.
  for (const debit of accountRows) {
    if (consumed.has(debit)) continue;
    if (!INVOICE_PAYMENT_ACCOUNT.test(flat(debit.row.description))) continue;

    const credit = cardRows.find(
      (candidate) =>
        !consumed.has(candidate) &&
        INVOICE_PAYMENT_CARD.test(flat(candidate.row.description)) &&
        candidate.row.externalId !== null &&
        candidate.row.externalId === debit.row.externalId &&
        candidate.row.amount === -debit.row.amount,
    );

    if (!credit) {
      unmatched.push({
        row: debit.row,
        expected: "crédito de pagamento na fatura do cartão com o mesmo FITID",
        source: debit.source,
      });
      take(debit);
      continue;
    }

    take(debit);
    take(credit);
    entries.push({
      kind: "invoice_payment",
      description: "Pagamento de fatura",
      amount: cents(-debit.row.amount),
      occurredOn: debit.row.date,
      origin: { kind: "account", id: config.accountId },
      destination: { kind: "card", id: config.cardId },
      // A competência é a da fatura que está sendo quitada, não a do mês em que
      // o dinheiro saiu: é ela que diz qual dívida caiu.
      competence: competenceOfTarget(credit.target),
      externalId: debit.row.externalId,
      fingerprintSeed: seedOf(debit),
      source: debit.source,
    });
  }

  // --- 2. pares que se anulam dentro da conta --------------------------------
  for (const credit of accountRows) {
    if (consumed.has(credit) || credit.row.amount <= 0) continue;
    const text = flat(credit.row.description);

    // 2a. aplicação que o banco devolveu: mesmo FITID, valor oposto.
    if (INVESTMENT_RETURNED.test(text)) {
      const debit = accountRows.find(
        (candidate) =>
          !consumed.has(candidate) &&
          candidate.row.externalId === credit.row.externalId &&
          INVESTMENT_FAILED.test(flat(candidate.row.description)) &&
          candidate.row.amount === -credit.row.amount,
      );
      if (debit && take(credit) && take(debit)) {
        cancelled.push({ reason: "aplicacao_devolvida", debit: debit.row, credit: credit.row, source: credit.source });
        continue;
      }
    }

    // 2b. Pix estornado: o FITID do estorno é o do original com sufixo.
    const base = credit.row.externalId?.endsWith(REVERSAL_SUFFIX)
      ? credit.row.externalId.slice(0, -REVERSAL_SUFFIX.length)
      : null;
    if (base !== null) {
      const debit = accountRows.find(
        (candidate) =>
          !consumed.has(candidate) &&
          candidate.row.externalId === base &&
          candidate.row.amount === -credit.row.amount,
      );
      if (debit && take(credit) && take(debit)) {
        cancelled.push({ reason: "pix_estornado", debit: debit.row, credit: credit.row, source: credit.source });
        continue;
      }
      unmatched.push({ row: credit.row, expected: `débito original com FITID ${base}`, source: credit.source });
      take(credit);
    }
  }

  // --- 3. caixinha -----------------------------------------------------------
  for (const tagged of accountRows) {
    if (consumed.has(tagged)) continue;
    const text = flat(tagged.row.description);
    const apply = INVESTMENT_APPLY.test(text);
    const redeem = INVESTMENT_REDEEM.test(text);
    if (!apply && !redeem) continue;

    take(tagged);
    entries.push({
      kind: "transfer",
      description: apply ? "Aplicação na caixinha" : "Resgate da caixinha",
      amount: cents(Math.abs(tagged.row.amount)),
      occurredOn: tagged.row.date,
      origin: { kind: "account", id: apply ? config.accountId : config.investmentAccountId },
      destination: { kind: "account", id: apply ? config.investmentAccountId : config.accountId },
      externalId: tagged.row.externalId,
      fingerprintSeed: seedOf(tagged),
      source: tagged.source,
    });
  }

  // --- 4. estorno e IOF no cartão -------------------------------------------
  // O crédito é casado dentro da **mesma fatura**. Anular contra a compra
  // original, que pode estar numa fatura anterior já paga, mudaria o total de
  // uma fatura que o usuário já quitou pelo valor cheio.
  for (const credit of cardRows) {
    if (consumed.has(credit) || credit.row.amount <= 0) continue;
    const text = flat(credit.row.description);
    const sameInvoice = (candidate: Tagged): boolean =>
      competenceOfTarget(candidate.target) === competenceOfTarget(credit.target);

    // 4a. mesmo FITID e valor exatamente oposto: a compra deixou de existir.
    const exact = cardRows.find(
      (candidate) =>
        !consumed.has(candidate) &&
        candidate.row.amount < 0 &&
        sameInvoice(candidate) &&
        candidate.row.externalId !== null &&
        candidate.row.externalId === credit.row.externalId &&
        candidate.row.amount === -credit.row.amount,
    );
    if (exact && take(credit) && take(exact)) {
      cancelled.push({ reason: "estorno_total", debit: exact.row, credit: credit.row, source: credit.source });
      continue;
    }

    // 4b. IOF devolvido: não compartilha FITID com o IOF cobrado, só o valor.
    if (IOF_RETURNED.test(text)) {
      const charged = cardRows.find(
        (candidate) =>
          !consumed.has(candidate) &&
          sameInvoice(candidate) &&
          IOF_CHARGED.test(flat(candidate.row.description)) &&
          candidate.row.amount === -credit.row.amount,
      );
      if (charged && take(credit) && take(charged)) {
        cancelled.push({ reason: "iof_devolvido", debit: charged.row, credit: credit.row, source: credit.source });
        continue;
      }
    }

    // 4c. sobra: estorno parcial, desconto de antecipação, ou devolução de uma
    // compra de fatura anterior. Vira estorno de verdade na fatura em que caiu.
    take(credit);
    entries.push({
      kind: "refund",
      description: credit.row.description,
      amount: cents(credit.row.amount),
      occurredOn: credit.row.date,
      origin: { kind: "card", id: config.cardId },
      competence: competenceOfTarget(credit.target),
      externalId: credit.row.externalId,
      fingerprintSeed: seedOf(credit),
      source: credit.source,
    });
  }

  // --- 5. transferências com contas próprias em outro banco ------------------
  const ownRules = config.ownExternalAccounts
    .map((rule) => ({ needle: flat(rule.match), accountId: rule.accountId }))
    .filter((rule) => rule.needle.length > 0)
    .sort((left, right) => right.needle.length - left.needle.length);

  for (const tagged of accountRows) {
    if (consumed.has(tagged)) continue;
    const text = flat(tagged.row.description);
    const rule = ownRules.find((candidate) => text.includes(candidate.needle));
    if (!rule) continue;

    const incoming = tagged.row.amount > 0;
    take(tagged);
    entries.push({
      kind: "transfer",
      description: tagged.row.description,
      amount: cents(Math.abs(tagged.row.amount)),
      occurredOn: tagged.row.date,
      origin: { kind: "account", id: incoming ? rule.accountId : config.accountId },
      destination: { kind: "account", id: incoming ? config.accountId : rule.accountId },
      externalId: tagged.row.externalId,
      fingerprintSeed: seedOf(tagged),
      source: tagged.source,
    });
  }

  // --- 6. o que sobrou é gasto ou dinheiro que entrou ------------------------
  for (const tagged of accountRows) {
    if (consumed.has(tagged)) continue;
    take(tagged);
    const incoming = tagged.row.amount > 0;
    entries.push({
      kind: incoming ? "income" : "expense",
      description: tagged.row.description,
      amount: cents(Math.abs(tagged.row.amount)),
      occurredOn: tagged.row.date,
      origin: { kind: "account", id: config.accountId },
      externalId: tagged.row.externalId,
      fingerprintSeed: seedOf(tagged),
      source: tagged.source,
    });
  }

  for (const tagged of cardRows) {
    if (consumed.has(tagged)) continue;
    take(tagged);
    // Sobrou crédito no cartão? Já foi tratado no passo 4; aqui só passa débito.
    entries.push({
      kind: "expense",
      description: tagged.row.description,
      amount: cents(Math.abs(tagged.row.amount)),
      occurredOn: tagged.row.date,
      origin: { kind: "card", id: config.cardId },
      competence: competenceOfTarget(tagged.target),
      ...(tagged.row.installment ? { installment: tagged.row.installment } : {}),
      externalId: tagged.row.externalId,
      fingerprintSeed: seedOf(tagged),
      source: tagged.source,
    });
  }

  return { entries, cancelled, unmatched, balances: checkBalances(sources, entries, config) };
}

// --- conferência -------------------------------------------------------------

/**
 * Efeito de um lançamento conciliado sobre uma parte, nas mesmas regras do
 * razão. Reimplementar aqui é de propósito: `core/domain/ledger/posting.ts`
 * trabalha sobre `Transaction` já persistível, e a conferência precisa
 * acontecer **antes** de qualquer gravação.
 */
function effectOn(entry: ReconciledEntry, party: { kind: "account" | "card"; id: string }): number {
  const isOrigin = entry.origin.kind === party.kind && entry.origin.id === party.id;
  const isDestination =
    entry.destination !== undefined && entry.destination.kind === party.kind && entry.destination.id === party.id;

  switch (entry.kind) {
    case "expense":
      return isOrigin ? -entry.amount : 0;
    case "income":
    case "refund":
      return isOrigin ? entry.amount : 0;
    case "transfer":
      return (isOrigin ? -entry.amount : 0) + (isDestination ? entry.amount : 0);
    case "invoice_payment":
      return (isOrigin ? -entry.amount : 0) + (isDestination ? entry.amount : 0);
  }
}

/**
 * Confere o conciliado contra o `LEDGERBAL` de cada arquivo.
 *
 * O saldo do arquivo é acumulado — já inclui tudo que veio antes —, então a
 * conferência soma o efeito de **todos** os lançamentos até aquele ponto, mais
 * o saldo de abertura.
 *
 * "Até aquele ponto" muda conforme o alvo, e é aqui que mora a sutileza. O
 * extrato da conta fecha em data de calendário, então a data serve. A fatura
 * **não é um mês**: ela fecha no dia 13 e uma compra do dia 13 já cai na
 * seguinte. Conferir cartão por data misturaria duas faturas e acusaria uma
 * divergência que não existe — por isso o cartão é somado por competência.
 */
function checkBalances(
  sources: readonly StatementSource[],
  entries: readonly ReconciledEntry[],
  config: ReconcileConfig,
): BalanceCheck[] {
  return sources
    .filter((source) => source.parsed.balance !== undefined)
    .map((source) => {
      const balance = source.parsed.balance as { amount: Cents; asOf: LocalDate };
      const isCard = source.target.kind === "card";
      const party = isCard
        ? ({ kind: "card", id: config.cardId } as const)
        : ({ kind: "account", id: config.accountId } as const);

      const until = competenceOfTarget(source.target);
      const included = entries.filter((entry) =>
        isCard
          ? entry.competence !== undefined && until !== undefined && entry.competence <= until
          : entry.occurredOn <= balance.asOf,
      );

      const opening = isCard ? (config.openingCardBalance ?? 0) : (config.openingAccountBalance ?? 0);
      const reconciled = included.reduce((total, entry) => total + effectOn(entry, party), opening as number);

      return {
        source: source.label,
        declared: balance.amount,
        reconciled: cents(reconciled),
        matches: reconciled === balance.amount,
      };
    });
}

/**
 * Prova que nenhuma linha se perdeu.
 *
 * Toda linha de entrada precisa aparecer exatamente uma vez no resultado: como
 * lançamento, como metade de um par anulado, ou como pendência. Sem esta
 * verificação, um `find` que não casa vira silêncio — e silêncio numa
 * importação é dinheiro que some do app sem ninguém perceber.
 */
export function assertComplete(sources: readonly StatementSource[], result: ReconcileResult): void {
  const input =
    collect(sources, false).length + collect(sources, true).length;
  // Pagamento de fatura consome duas linhas e devolve um lançamento; cada par
  // anulado consome duas.
  const invoicePayments = result.entries.filter((entry) => entry.kind === "invoice_payment").length;
  const accounted = result.entries.length + invoicePayments + result.cancelled.length * 2 + result.unmatched.length;

  if (accounted !== input) {
    throw new Error(
      `Conciliação perdeu linhas: ${input} entraram, ${accounted} foram contabilizadas ` +
        `(${result.entries.length} lançamentos, ${invoicePayments} com duas pernas, ` +
        `${result.cancelled.length} pares anulados, ${result.unmatched.length} pendências)`,
    );
  }
}
