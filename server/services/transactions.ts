/**
 * Serviço de lançamentos.
 *
 * Um caso de uso por função, com nome que diz o que faz. Substitui o `POST`
 * despachante que decidia entre quinze operações pela presença de uma chave no
 * corpo — e que, por isso, não tinha como validar nada direito.
 *
 * Nenhuma adivinhação: se a compra é no crédito, o cartão precisa ser
 * informado. A versão anterior assumia "se existe exatamente um cartão de
 * crédito, deve ser esse", e lançava no cartão errado assim que o usuário
 * cadastrava o segundo.
 */

import {
  type CycleConfig,
  competenceForPurchase,
} from "../../core/domain/card/invoice-cycle.ts";
import { scheduleInstallments } from "../../core/domain/installment/plan.ts";
import { invoiceTotals } from "../../core/domain/ledger/balance.ts";
import { accountBalance } from "../../core/domain/ledger/balance.ts";
import type { Party, Transaction, TransactionState } from "../../core/domain/ledger/types.ts";
import { accountParty, cardParty } from "../../core/domain/ledger/types.ts";
import { conflict, notFound, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import type { Cents } from "../../core/kernel/money.ts";
import { type Competence, competenceOf } from "../../core/time/competence.ts";
import { type LocalDate, todayIn } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { installmentPlans } from "../db/schema/index.ts";
import { type CardRecord, findAccount, findCard, listCategories } from "../repositories/catalog.ts";
import { earningForPurchase } from "./rewards.ts";
import { ensureInvoices, findInvoice } from "../repositories/invoices.ts";
import {
  findTransaction,
  loadLedger,
  saveTransactionBatch,
  softDeleteTransaction,
} from "../repositories/ledger.ts";

export type RecordTransactionInput = {
  readonly id?: string | null;
  readonly kind: "expense" | "income" | "transfer";
  readonly description: string;
  readonly amount: Cents;
  readonly occurredOn: LocalDate;
  readonly state: TransactionState;
  readonly categoryId?: string | null;
  /** Origem em conta. Exclusivo com `cardId`. */
  readonly accountId?: string | null;
  /** Origem em cartão — só para despesa no crédito. */
  readonly cardId?: string | null;
  readonly destinationAccountId?: string | null;
  readonly tripId?: string | null;
  /** Maior que 1 cria um parcelamento. */
  readonly installmentCount?: number | null;
  readonly monthlyInterestBasisPoints?: number | null;
  readonly notes?: string | null;
  readonly deviceId?: string | null;
};

export type RecordedTransaction = {
  readonly ids: readonly string[];
  readonly installmentPlanId: string | null;
  readonly competence: Competence;
};

/** Cria um lançamento — ou o conjunto de parcelas de uma compra parcelada. */
export async function recordTransaction(
  userId: string,
  input: RecordTransactionInput,
  now: Date = new Date(),
): Promise<RecordedTransaction> {
  const origin = await resolveOrigin(userId, input);
  const destination = await resolveDestination(userId, input);
  await assertCategory(userId, input);

  const installmentCount = input.installmentCount ?? 1;
  if (installmentCount > 1) {
    if (origin.party.kind !== "card") {
      throw conflict("Só é possível parcelar compra no cartão de crédito");
    }
    return recordInstallmentPurchase(
      userId,
      input,
      origin.party,
      origin.card!,
      installmentCount,
      now,
    );
  }

  const competence =
    origin.party.kind === "card"
      ? competenceForPurchase(origin.cycle!, input.occurredOn)
      : competenceOf(input.occurredOn);

  const transaction: Transaction = {
    id: input.id ?? newId(now.getTime()),
    userId,
    kind: input.kind,
    state: input.state,
    source: "manual",
    description: input.description,
    categoryId: input.kind === "transfer" ? null : (input.categoryId ?? null),
    amount: input.amount,
    currency: "BRL",
    occurredOn: input.occurredOn,
    origin: origin.party,
    destination,
    competence,
    tripId: input.tripId ?? null,
    installmentPlanId: null,
    installmentNumber: null,
    recurrenceId: null,
    notes: input.notes ?? null,
  };

  // Compra no crédito apura a recompensa agora, com a cotação de hoje.
  let reward = null;
  if (origin.party.kind === "card" && origin.card) {
    await ensureInvoices({ userId, cardId: origin.party.cardId, cycle: origin.cycle!, competences: [competence] });
    reward = await earningForPurchase(origin.card, input.amount, now);
  }

  await saveTransactionBatch([
    { transaction, options: { deviceId: input.deviceId ?? null, reward } },
  ]);
  return { ids: [transaction.id], installmentPlanId: null, competence };
}

async function recordInstallmentPurchase(
  userId: string,
  input: RecordTransactionInput,
  card: Extract<Party, { kind: "card" }>,
  cardRecord: CardRecord,
  installmentCount: number,
  now: Date,
): Promise<RecordedTransaction> {
  const cycle = cardRecord;
  const schedule = scheduleInstallments({
    totalAmount: input.amount,
    installmentCount,
    purchaseDate: input.occurredOn,
    cycle,
  });

  const planId = newId(now.getTime());
  const database = getDatabase();

  await database.insert(installmentPlans).values({
    id: planId,
    userId,
    cardId: card.cardId,
    categoryId: input.categoryId ?? null,
    description: input.description,
    totalAmountCents: input.amount as number,
    installmentCount,
    purchaseDate: input.occurredOn as string,
    firstCompetence: schedule[0].competence as string,
    monthlyInterestBasisPoints: input.monthlyInterestBasisPoints ?? 0,
    label: null,
    status: "active",
  });

  await ensureInvoices({
    userId,
    cardId: card.cardId,
    cycle,
    competences: schedule.map((item) => item.competence),
  });

  // Cada parcela rende sobre o próprio valor, não sobre o total da compra: é
  // assim que o emissor credita, e apurar tudo na primeira parcela daria um
  // saldo de pontos que não bate com o extrato do cartão.
  const recompensas = await Promise.all(
    schedule.map((installment) => earningForPurchase(cardRecord, installment.amount, now)),
  );

  const transactions = schedule.map(
    (installment, indice) => ({
      transaction: {
        id: newId(now.getTime()),
        userId,
        kind: "expense",
        // A primeira parcela é fato consumado; as seguintes são compromisso
        // futuro, e por isso entram como previstas.
        state: installment.number === 1 ? input.state : "planned",
        source: "installment",
        description: input.description,
        categoryId: input.categoryId ?? null,
        amount: installment.amount,
        currency: "BRL",
        occurredOn: installment.occurredOn,
        origin: card,
        destination: null,
        competence: installment.competence,
        tripId: input.tripId ?? null,
        installmentPlanId: planId,
        installmentNumber: installment.number,
        recurrenceId: null,
        notes: input.notes ?? null,
      } satisfies Transaction,
      options: { deviceId: input.deviceId ?? null, reward: recompensas[indice] },
    }),
  );

  await saveTransactionBatch(transactions);

  return {
    ids: transactions.map((entry) => entry.transaction.id),
    installmentPlanId: planId,
    competence: schedule[0].competence,
  };
}

type ResolvedOrigin = { party: Party; cycle: CycleConfig | null; card: CardRecord | null };

async function resolveOrigin(userId: string, input: RecordTransactionInput): Promise<ResolvedOrigin> {
  if (input.cardId && input.accountId) {
    throw validationError("Informe a conta ou o cartão, não os dois", [
      { path: "cardId", message: "Escolha apenas uma origem" },
    ]);
  }

  if (input.cardId) {
    if (input.kind !== "expense") {
      throw conflict("Só despesa pode ser lançada no cartão de crédito");
    }
    const card = await findCard(userId, input.cardId);
    if (!card) throw notFound("Cartão", input.cardId);
    if (card.kind !== "credit") {
      throw conflict("Compra no crédito exige um cartão de crédito");
    }
    return { party: cardParty(card.id), cycle: card, card };
  }

  if (!input.accountId) {
    throw validationError("Informe a conta ou o cartão do lançamento", [
      { path: "accountId", message: "Selecione a conta" },
    ]);
  }

  const account = await findAccount(userId, input.accountId);
  if (!account) throw notFound("Conta", input.accountId);
  if (account.archivedAt) throw conflict("Esta conta está arquivada");

  return { party: accountParty(account.id), cycle: null, card: null };
}

async function resolveDestination(userId: string, input: RecordTransactionInput): Promise<Party | null> {
  if (input.kind !== "transfer") return null;

  if (!input.destinationAccountId) {
    throw validationError("Transferência exige conta de destino", [
      { path: "destinationAccountId", message: "Selecione a conta de destino" },
    ]);
  }
  if (input.destinationAccountId === input.accountId) {
    throw conflict("A conta de origem e a de destino precisam ser diferentes");
  }

  const account = await findAccount(userId, input.destinationAccountId);
  if (!account) throw notFound("Conta de destino", input.destinationAccountId);

  return accountParty(account.id);
}

async function assertCategory(userId: string, input: RecordTransactionInput): Promise<void> {
  if (input.kind === "transfer" || !input.categoryId) return;

  const categories = await listCategories(userId);
  const category = categories.find((item) => item.id === input.categoryId);
  if (!category) throw notFound("Categoria", input.categoryId);

  const expected = input.kind === "income" ? "income" : "expense";
  if (category.kind !== expected) {
    throw conflict(
      expected === "income"
        ? "Receita precisa de uma categoria de entrada"
        : "Despesa precisa de uma categoria de saída",
    );
  }
}

// ---------------------------------------------------------------------------
// Pagamento de fatura
// ---------------------------------------------------------------------------

export type PayInvoiceInput = {
  readonly cardId: string;
  readonly competence: Competence;
  readonly accountId: string;
  /** Ausente paga o restante em aberto. */
  readonly amount?: Cents | null;
  readonly paidOn?: LocalDate | null;
  readonly deviceId?: string | null;
};

/**
 * Paga uma fatura.
 *
 * O pagamento **não é despesa**: é uma transferência que tira dinheiro da
 * conta e abate a dívida do cartão. As compras já foram contadas quando
 * aconteceram; contar de novo aqui dobraria o gasto do mês.
 */
export async function payInvoice(
  userId: string,
  input: PayInvoiceInput,
  now: Date = new Date(),
): Promise<{ transactionId: string; paidCents: number; remainingCents: number }> {
  const card = await findCard(userId, input.cardId);
  if (!card) throw notFound("Cartão", input.cardId);
  if (card.kind !== "credit") throw conflict("Só cartão de crédito tem fatura");

  const account = await findAccount(userId, input.accountId);
  if (!account) throw notFound("Conta", input.accountId);

  const entries = await loadLedger(userId);
  const totals = invoiceTotals(entries, card.id, input.competence);

  if (totals.outstanding <= 0) {
    throw conflict("Esta fatura já está quitada", { competence: input.competence });
  }

  const amount = input.amount ?? totals.outstanding;
  if (amount <= 0) {
    throw validationError("Informe um valor maior que zero", [
      { path: "amount", message: "Informe um valor maior que zero" },
    ]);
  }
  if (amount > totals.outstanding) {
    throw conflict("O valor é maior que o restante em aberto da fatura", {
      outstandingCents: totals.outstanding,
    });
  }

  const paidOn = input.paidOn ?? todayIn(now);

  // Pagamento é fato consumado. Aceitar data futura fazia a dívida do cartão
  // cair hoje enquanto o dinheiro só sairia da conta depois — o patrimônio
  // subia sozinho. Agendar pagamento é outra coisa, e seria um previsto.
  if (paidOn > todayIn(now)) {
    throw validationError("O pagamento não pode ter data futura", [
      { path: "paidOn", message: "Informe a data em que o pagamento aconteceu" },
    ]);
  }

  const available = accountBalance(entries, account.id, paidOn, account.openingBalance);
  if (available < amount) {
    throw conflict("Saldo insuficiente na conta escolhida", {
      availableCents: available,
      requiredCents: amount,
    });
  }

  const invoice = await findInvoice(userId, card.id, input.competence);

  const transaction: Transaction = {
    id: newId(now.getTime()),
    userId,
    kind: "invoice_payment",
    state: "confirmed",
    source: "invoice_payment",
    description: `Pagamento da fatura ${input.competence} · ${card.name}`,
    categoryId: null,
    amount,
    currency: "BRL",
    occurredOn: paidOn,
    origin: accountParty(account.id),
    destination: cardParty(card.id),
    // A perna do cartão pertence à fatura quitada, que pode ser anterior ao
    // mês em que o dinheiro saiu da conta.
    competence: input.competence,
    tripId: null,
    installmentPlanId: null,
    installmentNumber: null,
    recurrenceId: null,
    notes: null,
  };

  await saveTransactionBatch([
    { transaction, options: { deviceId: input.deviceId ?? null, invoiceId: invoice?.id ?? null } },
  ]);

  return {
    transactionId: transaction.id,
    paidCents: amount,
    remainingCents: totals.outstanding - amount,
  };
}

// ---------------------------------------------------------------------------
// Exclusão
// ---------------------------------------------------------------------------

export async function removeTransaction(
  userId: string,
  transactionId: string,
  options: { deviceId?: string | null } = {},
): Promise<boolean> {
  const existing = await findTransaction(userId, transactionId);
  if (!existing) return false;
  return softDeleteTransaction(userId, transactionId, options);
}
