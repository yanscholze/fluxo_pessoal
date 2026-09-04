/**
 * `POST /api/v1/projects/:id/payments` — agenda uma parcela do contrato.
 *
 * Agendar é previsão; receber é outra rota, porque receber move dinheiro de
 * verdade e precisa saber em que conta.
 */

import { requireUser } from "../../../../../../server/auth/session.ts";
import { read } from "../../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../server/http/route-params.ts";
import { schedulePayment } from "../../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const projectId = segmentAfter(request, "projects");
  const input = read(await readJson(request));

  const payload = {
    projectId,
    description: input.string("description", { max: 160 }),
    amount: input.money("amount"),
    dueOn: input.date("dueOn"),
    notes: input.optionalString("notes", { max: 500 }),
  };
  input.done();

  const id = await schedulePayment(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
