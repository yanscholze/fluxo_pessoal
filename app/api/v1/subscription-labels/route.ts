/**
 * `GET  /api/v1/subscription-labels` — classificações de assinatura.
 * `POST /api/v1/subscription-labels` — cria uma.
 *
 * Eixo diferente da categoria: a categoria responde "que tipo de gasto é" para
 * o orçamento; a classificação responde "que tipo de assinatura é" dentro do
 * bolo de assinaturas.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { createLabel, ensureLabels } from "../../../../server/services/subscriptions.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await ensureLabels(user.id) });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const payload = {
    name: input.string("name", { max: 60 }),
    color: input.optionalString("color", { max: 9 }),
  };
  input.done();

  const id = await createLabel(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
