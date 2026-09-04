/**
 * `PATCH  /api/v1/time/:id` — corrige uma sessão de trabalho.
 * `DELETE /api/v1/time/:id` — apaga.
 *
 * Lançar hora errada é a regra, não a exceção: registra-se no fim do dia, de
 * memória. Sem correção, consertar exigiria apagar e relançar, e o relatório
 * de um projeto entregue nunca fecharia com o que aconteceu.
 */

import { ACTIVITIES } from "../../../../../core/domain/work/activity.ts";
import { fromMinutes } from "../../../../../core/domain/work/hours.ts";
import { notFound } from "../../../../../core/kernel/errors.ts";
import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, noContent, readJson } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { removeTimeEntry, updateTimeEntry } from "../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

/** Um dia inteiro. Acima disso é erro de digitação, não jornada. */
const MAX_MINUTOS = 24 * 60;

function idOf(request: Request): string {
  return segmentAfter(request, "time");
}

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const entryId = idOf(request);
  const input = read(await readJson(request));

  const minutos = input.optionalInteger("minutes", { min: 1, max: MAX_MINUTOS });
  const billable = input.optionalChoice("billable", ["true", "false"] as const);

  const patch = {
    workedOn: input.optionalDate("workedOn"),
    duration: minutos === null ? null : fromMinutes(minutos),
    description: input.optionalString("description", { max: 300 }),
    activity: input.optionalChoice("activity", ACTIVITIES),
    billable: billable === null ? null : billable === "true",
    taskId: input.optionalReference("taskId"),
    // `provided` separa "não mandou o campo" de "mandou vazio para desvincular".
    clearTask: input.provided("taskId") && input.optionalReference("taskId") === null,
  };
  input.done();

  await updateTimeEntry(user.id, entryId, patch);
  return json({ data: { ok: true } });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  const entryId = idOf(request);

  if (!(await removeTimeEntry(user.id, entryId))) throw notFound("Sessão de trabalho", entryId);
  return noContent();
});
