/**
 * `GET  /api/v1/budgets` — orçamentos da competência, com gasto e projeção.
 * `POST /api/v1/budgets` — define ou atualiza o teto de uma categoria.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { buildBudgetsView, setBudget } from "../../../../server/services/budgets.ts";
import { parseCompetence } from "../../../../core/time/competence.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const competence = parseCompetence(new URL(request.url).searchParams.get("competencia"));
  return json({ data: await buildBudgetsView(user.id, competence ?? undefined) });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const payload = {
    categoryId: input.reference("categoryId"),
    amount: input.money("amount"),
    startsOn: input.optionalDate("startsOn"),
  };

  input.done();

  const id = await setBudget(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
