/**
 * `GET /api/v1/timesheet` — o relatório de horas.
 *
 * Sem `projectId`, é a carteira inteira — e aí a média de horas por projeto
 * passa a significar alguma coisa. Com ele, é o relatório de fechamento de um
 * projeto: o que se olha quando o trabalho acaba e a pergunta é se valeu a pena.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { handle, json } from "../../../../server/http/respond.ts";
import { buildTimesheetReport } from "../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const projectId = new URL(request.url).searchParams.get("projectId");

  return json({ data: await buildTimesheetReport(user.id, projectId ?? undefined) });
});
