/**
 * `GET    /api/v1/transactions/:id` — um lançamento.
 * `PATCH  /api/v1/transactions/:id` — corrige o que foi registrado errado.
 * `DELETE /api/v1/transactions/:id` — apaga logicamente.
 *
 * Até aqui o Fluxo só sabia **criar** lançamento. Errar a data, o valor ou a
 * conta era permanente, e a única saída era conviver com o erro — num produto
 * cujo propósito é o saldo estar certo.
 *
 * Editar não altera a linha no lugar: reaproveita o mesmo identificador e
 * regrava o lançamento inteiro, o que faz o razão apagar as movimentações
 * antigas e postar as novas na mesma transação de banco. É por isso que mudar
 * a data move a competência e a fatura junto, sem ninguém precisar lembrar de
 * recalcular.
 */

import { conflict, notFound } from "../../../../../core/kernel/errors.ts";
import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, noContent, readJson } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { findTransaction } from "../../../../../server/repositories/ledger.ts";
import { recordTransaction, removeTransaction } from "../../../../../server/services/transactions.ts";

export const dynamic = "force-dynamic";

function idOf(request: Request): string {
  return segmentAfter(request, "transactions");
}

function serialize(transaction: Awaited<ReturnType<typeof findTransaction>>) {
  if (!transaction) return null;
  return {
    id: transaction.id,
    kind: transaction.kind,
    state: transaction.state,
    description: transaction.description,
    categoryId: transaction.categoryId,
    amountCents: transaction.amount,
    occurredOn: transaction.occurredOn,
    competence: transaction.competence,
    origin: transaction.origin,
    destination: transaction.destination,
    installmentPlanId: transaction.installmentPlanId,
    installmentNumber: transaction.installmentNumber,
    tripId: transaction.tripId,
    notes: transaction.notes,
  };
}

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const transactionId = idOf(request);

  const transaction = await findTransaction(user.id, transactionId);
  if (!transaction) throw notFound("Lançamento", transactionId);

  return json({ data: serialize(transaction) });
});

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const transactionId = idOf(request);

  const atual = await findTransaction(user.id, transactionId);
  if (!atual) throw notFound("Lançamento", transactionId);

  // Parcela não se edita sozinha: mudar o valor de uma faria a soma das
  // parcelas deixar de bater com o total da compra, e o plano passaria a
  // descrever uma dívida que não existe. O caminho é mexer no plano.
  if (atual.installmentPlanId) {
    throw conflict("Parcela não se edita isolada; altere o parcelamento", {
      installmentPlanId: atual.installmentPlanId,
    });
  }

  // Pagamento de fatura tem regra própria — confere saldo, amarra a
  // competência quitada e liga o pagamento à fatura. Regravá-lo como
  // lançamento comum desfaria essa amarração em silêncio.
  if (atual.kind === "invoice_payment") {
    throw conflict("Pagamento de fatura não se edita; apague e registre de novo");
  }

  const input = read(await readJson(request));

  const description = input.optionalString("description", { max: 160 });
  const amount = input.optionalMoney("amount");
  const occurredOn = input.optionalDate("occurredOn");
  const categoryId = input.optionalReference("categoryId");
  const accountId = input.optionalReference("accountId");
  const cardId = input.optionalReference("cardId");
  const destinationAccountId = input.optionalReference("destinationAccountId");
  const tripId = input.optionalReference("tripId");
  const notes = input.optionalString("notes", { max: 500 });
  const state = input.optionalChoice("state", ["confirmed", "planned"] as const);

  input.done();

  const origemAtual =
    atual.origin.kind === "card"
      ? { cardId: atual.origin.cardId, accountId: null }
      : { cardId: null, accountId: atual.origin.accountId };

  // A origem é trocada em bloco: informar só o cartão numa despesa que estava
  // em conta precisa **limpar** a conta, senão o serviço recebe as duas e
  // recusa a edição inteira.
  const origemInformada = accountId !== null || cardId !== null;

  const { ids, competence } = await recordTransaction(user.id, {
    id: atual.id,
    kind: atual.kind,
    description: description ?? atual.description,
    amount: amount ?? atual.amount,
    occurredOn: occurredOn ?? atual.occurredOn,
    state: state ?? atual.state,
    categoryId: categoryId ?? atual.categoryId,
    accountId: origemInformada ? accountId : origemAtual.accountId,
    cardId: origemInformada ? cardId : origemAtual.cardId,
    destinationAccountId:
      destinationAccountId ??
      (atual.destination?.kind === "account" ? atual.destination.accountId : null),
    tripId: tripId ?? atual.tripId,
    notes: notes ?? atual.notes,
  });

  return json({ data: { id: ids[0], competence } });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  const transactionId = idOf(request);

  const apagado = await removeTransaction(user.id, transactionId);
  if (!apagado) throw notFound("Lançamento", transactionId);

  return noContent();
});
