/**
 * `POST /api/v1/projects/:id/proposals` — registra uma proposta.
 */

import { requireUser } from "../../../../../../server/auth/session.ts";
import { read } from "../../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../server/http/route-params.ts";
import { createProposal } from "../../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const projectId = segmentAfter(request, "projects");
  const input = read(await readJson(request));

  const payload = {
    projectId,
    title: input.string("title", { max: 200 }),
    amount: input.money("amount"),
    scope: input.optionalString("scope", { max: 4000 }),
    conditions: input.optionalString("conditions", { max: 2000 }),
    deadlineDays: input.optionalInteger("deadlineDays", { min: 1, max: 3650 }),
    fileUrl: input.optionalString("fileUrl", { max: 300 }),
    notes: input.optionalString("notes", { max: 2000 }),
  };
  input.done();

  const id = await createProposal(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
