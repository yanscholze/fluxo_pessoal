import { requireUser } from "../../../../../../server/auth/session.ts";
import { read } from "../../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../server/http/route-params.ts";
import { createChecklistGroup } from "../../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";
export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const projectId = segmentAfter(request, "projects");
  const input = read(await readJson(request));
  const name = input.string("name", { max: 120 });
  input.done();
  const id = await createChecklistGroup(user.id, projectId, name);
  return json({ data: { id } }, { status: 201 });
});
