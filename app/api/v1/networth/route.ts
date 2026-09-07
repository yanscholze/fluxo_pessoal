/**
 * `GET /api/v1/networth`
 *
 * Patrimônio: líquido, ativos, dívidas e a evolução dos últimos meses.
 *
 * O celular mostrava o saldo do dia e nada do acumulado. Patrimônio é a
 * pergunta de fim de mês, e ela não precisa de mesa para ser respondida.
 *
 * Rota fina: autentica, chama o serviço, devolve. Nenhuma regra aqui.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { handle, json } from "../../../../server/http/respond.ts";
import { buildNetWorthView } from "../../../../server/services/networth.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildNetWorthView(user.id) });
});
