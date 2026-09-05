/**
 * `POST /api/v1/projects/:id/tasks` — cria tarefa, pendência ou suporte.
 *
 * `kind` é o que separa "consertar o que deveria funcionar" de "construir algo
 * novo", e é o que decide se aquilo entra na próxima cobrança. Por isso o
 * padrão de `billable` acompanha o tipo em vez de ser sempre verdadeiro.
 */

import { fromMinutes } from "../../../../../../core/domain/work/hours.ts";
import { requireUser } from "../../../../../../server/auth/session.ts";
import { read } from "../../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../server/http/route-params.ts";
import { createTask } from "../../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

const NATUREZAS = ["feature", "support", "improvement", "chore", "bug"] as const;
const PRIORIDADES = ["low", "normal", "high", "urgent"] as const;

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const projectId = segmentAfter(request, "projects");
  const input = read(await readJson(request));

  const minutos = input.optionalInteger("estimateMinutes", { min: 0, max: 100_000 });
  const cobravel = input.optionalBoolean("billable");

  const payload = {
    projectId,
    title: input.string("title", { max: 200 }),
    details: input.optionalString("details", { max: 2000 }),
    kind: input.optionalChoice("kind", NATUREZAS) ?? undefined,
    priority: input.optionalChoice("priority", PRIORIDADES) ?? undefined,
    dueOn: input.optionalDate("dueOn"),
    estimate: minutos === null ? null : fromMinutes(minutos),
    ...(cobravel !== null ? { billable: cobravel } : {}),
  };
  input.done();

  const id = await createTask(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
