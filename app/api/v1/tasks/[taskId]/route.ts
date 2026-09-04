/**
 * `PATCH /api/v1/tasks/:id` — move a tarefa de coluna.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { setTaskStatus } from "../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

const SITUACOES = ["todo", "doing", "blocked", "review", "done"] as const;

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const taskId = segmentAfter(request, "tasks");
  const input = read(await readJson(request));

  const status = input.choice("status", SITUACOES);
  input.done();

  await setTaskStatus(user.id, taskId, status);
  return json({ data: { ok: true } });
});
