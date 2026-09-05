/**
 * `PATCH  /api/v1/recurrences/:id` — pausa, retoma e ajusta o que se repete.
 * `DELETE /api/v1/recurrences/:id` — apaga a regra.
 *
 * Pausar e apagar respondem coisas diferentes. Pausada, a regra para de
 * projetar mas continua na tela: é o serviço que se cancelou e talvez volte.
 * Apagada, some — e o que ela já lançou fica, porque virou fato no razão.
 */

import { notFound } from "../../../../../core/kernel/errors.ts";
import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, noContent, readJson } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { removeRecurrence, setRecurrenceActive } from "../../../../../server/services/recurrences.ts";
import { updateSubscription } from "../../../../../server/services/subscriptions.ts";

export const dynamic = "force-dynamic";

function idOf(request: Request): string {
  return segmentAfter(request, "recurrences");
}

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const recurrenceId = idOf(request);
  const input = read(await readJson(request));

  const ativa = input.optionalBoolean("isActive");

  const campos = {
    description: input.optionalString("description", { max: 120 }),
    amount: input.optionalMoney("amount"),
    scheduleDay: input.optionalInteger("scheduleDay", { min: 1, max: 31 }),
    interval: input.optionalChoice("interval", ["monthly", "yearly"] as const),
    cardId: input.optionalReference("cardId"),
    accountId: input.optionalReference("accountId"),
    categoryId: input.optionalReference("categoryId"),
    labelId: input.optionalReference("labelId"),
    // `provided` separa "não mandou o campo" de "mandou vazio para limpar".
    clearLabel: input.provided("labelId") && input.optionalReference("labelId") === null,
    clearCategory: input.provided("categoryId") && input.optionalReference("categoryId") === null,
  };
  input.done();

  if (ativa !== null) await setRecurrenceActive(user.id, recurrenceId, ativa);

  const mexeu =
    campos.description !== null ||
    campos.amount !== null ||
    campos.scheduleDay !== null ||
    campos.interval !== null ||
    campos.cardId !== null ||
    campos.accountId !== null ||
    campos.categoryId !== null ||
    campos.labelId !== null ||
    campos.clearLabel ||
    campos.clearCategory;

  if (mexeu) await updateSubscription(user.id, recurrenceId, campos);

  return json({ data: { ok: true } });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  const recurrenceId = idOf(request);

  if (!(await removeRecurrence(user.id, recurrenceId))) throw notFound("Recorrência", recurrenceId);
  return noContent();
});
