/**
 * `PATCH /api/v1/tasks/:id` — move a tarefa de coluna.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { archiveChecklistTask, setTaskStatus, updateChecklistTask } from "../../../../../server/services/work.ts";
import { notFound } from "../../../../../core/kernel/errors.ts";
import { noContent } from "../../../../../server/http/respond.ts";

export const dynamic = "force-dynamic";

const SITUACOES = ["todo", "doing", "blocked", "review", "done"] as const;

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const taskId = segmentAfter(request, "tasks");
  const input = read(await readJson(request));

  const status = input.optionalChoice("status", SITUACOES);
  const title = input.optionalString("title", { max: 200 });
  const groupId = input.provided("groupId") ? input.optionalReference("groupId") : undefined;
  const sortOrder = input.optionalInteger("sortOrder", { min: 0, max: 100000 });
  input.done();
  if (!status && title === null && groupId === undefined && sortOrder === null) throw notFound("Atualização", taskId);
  if (status) await setTaskStatus(user.id, taskId, status);
  if (title !== null || groupId !== undefined || sortOrder !== null) await updateChecklistTask(user.id, taskId, { ...(title !== null ? { title } : {}), ...(groupId !== undefined ? { groupId } : {}), ...(sortOrder !== null ? { sortOrder } : {}) });
  return json({ data: { ok: true } });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  await archiveChecklistTask(user.id, segmentAfter(request, "tasks"));
  return noContent();
});
