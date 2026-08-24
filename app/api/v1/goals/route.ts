/**
 * `GET  /api/v1/goals` — metas com progresso e previsão de conclusão.
 * `POST /api/v1/goals` — cria uma meta, ou registra um aporte nela.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { buildGoalsView, contributeToGoal, createGoal } from "../../../../server/services/goals.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildGoalsView(user.id) });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  // Aportar numa meta existente e criar uma meta nova são pedidos diferentes;
  // a presença de `goalId` distingue os dois sem precisar de outra rota.
  const goalId = input.optionalReference("goalId");

  if (goalId) {
    const amount = input.money("amount");
    const occurredOn = input.optionalDate("occurredOn");
    const note = input.optionalString("note", { max: 200 });
    input.done();

    await contributeToGoal(user.id, goalId, { amount, occurredOn, note });
    return json({ data: { ok: true } }, { status: 201 });
  }

  const payload = {
    name: input.string("name", { max: 80 }),
    target: input.money("target"),
    monthlyContribution: input.optionalMoney("monthlyContribution"),
    targetDate: input.optionalDate("targetDate"),
    accountId: input.optionalReference("accountId"),
    color: input.optionalString("color", { max: 9 }),
  };

  input.done();

  const id = await createGoal(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
