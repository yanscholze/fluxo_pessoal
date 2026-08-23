/**
 * `GET /api/v1/transactions` — lista lançamentos do período.
 * `POST /api/v1/transactions` — registra um lançamento ou uma compra parcelada.
 *
 * Rota fina: valida a entrada, chama o serviço, serializa a saída. Nenhuma
 * regra financeira aqui.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { listTransactions } from "../../../../server/repositories/ledger.ts";
import { recordTransaction } from "../../../../server/services/transactions.ts";
import { parseLocalDate } from "../../../../core/time/local-date.ts";

export const dynamic = "force-dynamic";

const MAX_PAGE = 500;

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const url = new URL(request.url);

  const transactions = await listTransactions(user.id, {
    from: parseLocalDate(url.searchParams.get("from")) ?? undefined,
    to: parseLocalDate(url.searchParams.get("to")) ?? undefined,
    limit: Math.min(MAX_PAGE, Number(url.searchParams.get("limit")) || 100),
  });

  return json({
    data: transactions.map((transaction) => ({
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
    })),
  });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const input = read(body);

  const payload = {
    id: input.optionalId("id"),
    kind: input.choice("kind", ["expense", "income", "transfer"] as const),
    description: input.string("description", { max: 160 }),
    amount: input.money("amount"),
    occurredOn: input.date("occurredOn"),
    state: input.optionalChoice("state", ["confirmed", "planned"] as const) ?? "confirmed",
    categoryId: input.optionalReference("categoryId"),
    accountId: input.optionalReference("accountId"),
    cardId: input.optionalReference("cardId"),
    destinationAccountId: input.optionalReference("destinationAccountId"),
    tripId: input.optionalReference("tripId"),
    installmentCount: input.optionalInteger("installmentCount", { min: 1, max: 48 }),
    monthlyInterestBasisPoints: input.optionalInteger("monthlyInterestBasisPoints", { min: 0, max: 100_000 }),
    notes: input.optionalString("notes", { max: 500 }),
    deviceId: input.optionalString("deviceId", { max: 80 }),
  };

  input.done();

  const result = await recordTransaction(user.id, payload);
  return json({ data: result }, { status: 201 });
});
