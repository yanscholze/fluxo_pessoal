import { requireUser } from "../../../../../../../server/auth/session.ts";
import { read } from "../../../../../../../server/http/input.ts";
import { handle, json, noContent, readJson } from "../../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../../server/http/route-params.ts";
import { removeChecklistGroup, updateChecklistGroup } from "../../../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const groupId = segmentAfter(request, "checklist-groups");
  const input = read(await readJson(request));
  const name = input.optionalString("name", { max: 120 });
  const sortOrder = input.optionalInteger("sortOrder", { min: 0, max: 100000 });
  input.done();
  await updateChecklistGroup(user.id, groupId, { ...(name ? { name } : {}), ...(sortOrder !== null ? { sortOrder } : {}) });
  return json({ data: { ok: true } });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  await removeChecklistGroup(user.id, segmentAfter(request, "checklist-groups"));
  return noContent();
});
