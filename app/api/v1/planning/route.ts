/**
 * `GET /api/v1/planning`
 *
 * Planejamento: recorrências, o que aguarda confirmação e a projeção à frente.
 *
 * Confirmar uma recorrência é o gesto mais barato do produto — um toque
 * transforma projeção em lançamento — e era o que mais faltava no bolso.
 *
 * Rota fina: autentica, chama o serviço, devolve. Nenhuma regra aqui.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { handle, json } from "../../../../server/http/respond.ts";
import { buildPlanningView } from "../../../../server/services/planning.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildPlanningView(user.id) });
});
