/**
 * `GET /api/v1/work/board`
 *
 * Quadro dos projetos por situação: em desenvolvimento, testes, ajustes, entregue.
 *
 * Mover uma tarefa de coluna é gesto de celular, não de mesa. Sem a rota, a
 * área de trabalho inteira ficava fora do aplicativo.
 *
 * Rota fina: autentica, chama o serviço, devolve.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { handle, json } from "../../../../../server/http/respond.ts";
import { buildBoard } from "../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildBoard(user.id) });
});
