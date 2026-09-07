/**
 * `GET /api/v1/work/agenda`
 *
 * Agenda do trabalho: prazos, tarefas e recebimentos à frente.
 *
 * É a consulta que se faz a caminho do cliente, e era a que só existia no
 * computador.
 *
 * Rota fina: autentica, chama o serviço, devolve.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { handle, json } from "../../../../../server/http/respond.ts";
import { buildAgenda } from "../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildAgenda(user.id) });
});
