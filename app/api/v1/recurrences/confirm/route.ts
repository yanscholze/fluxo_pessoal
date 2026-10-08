/**
 * `POST /api/v1/recurrences/confirm` — registra que a ocorrência aconteceu.
 *
 * Idempotente por `(regra, competência)`: confirmar o salário de agosto duas
 * vezes não credita duas vezes.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../server/http/respond.ts";
import { confirmOccurrence, linkOccurrence, occurrenceTransactions } from "../../../../../server/services/recurrences.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const query = new URL(request.url).searchParams;
  const input = read({ recurrenceId: query.get("recurrenceId"), competence: query.get("competence") });
  const recurrenceId = input.reference("recurrenceId");
  const competence = input.competence("competence");
  input.done();
  return json({ data: { transactions: await occurrenceTransactions(user.id, recurrenceId, competence) } });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const recurrenceId = input.reference("recurrenceId");
  const competence = input.competence("competence");
  const amount = input.optionalMoney("amount");
  const occurredOn = input.optionalDate("occurredOn");
  const transactionId = input.optionalReference("transactionId");

  input.done();

  const result = transactionId
    ? await linkOccurrence(user.id, recurrenceId, competence, transactionId)
    : await confirmOccurrence(user.id, recurrenceId, competence, { amount, occurredOn });
  return json({ data: result }, { status: result.alreadyConfirmed ? 200 : 201 });
});
