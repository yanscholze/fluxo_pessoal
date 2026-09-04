/**
 * `POST /api/v1/projects/:id/time` — registra uma sessão de trabalho.
 *
 * A duração entra em **minutos inteiros**, não em horas decimais. O contrato
 * da API fica sem ponto flutuante, e a conversão para milésimos de hora
 * acontece uma única vez, aqui na borda. Aceitar "1.5" obrigaria cada cliente
 * a acertar o próprio arredondamento, e dois clientes arredondariam diferente.
 */

import { ACTIVITIES } from "../../../../../../core/domain/work/activity.ts";
import { fromMinutes } from "../../../../../../core/domain/work/hours.ts";
import { requireUser } from "../../../../../../server/auth/session.ts";
import { read } from "../../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../server/http/route-params.ts";
import { logTime } from "../../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

/** Um dia inteiro. Acima disso é erro de digitação, não jornada. */
const MAX_MINUTOS = 24 * 60;

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const projectId = segmentAfter(request, "projects");
  const input = read(await readJson(request));

  const payload = {
    projectId,
    taskId: input.optionalReference("taskId"),
    workedOn: input.date("workedOn"),
    duration: fromMinutes(input.integer("minutes", { min: 1, max: MAX_MINUTOS })),
    description: input.string("description", { max: 300 }),
    activity: input.optionalChoice("activity", ACTIVITIES) ?? "development",
    billable: input.boolean("billable", true),
  };
  input.done();

  const id = await logTime(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
