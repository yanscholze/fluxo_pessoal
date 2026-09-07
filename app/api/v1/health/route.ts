/**
 * `GET /api/v1/health`
 *
 * Saúde financeira: sinais de diagnóstico, reserva de emergência e dívidas.
 *
 * Existia só como página do site, que chama o serviço direto. Sem rota, o
 * aplicativo não tinha como mostrar o mesmo diagnóstico — e diagnóstico é
 * justamente o que se quer consultar longe do computador.
 *
 * Rota fina: autentica, chama o serviço, devolve. Nenhuma regra aqui.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { handle, json } from "../../../../server/http/respond.ts";
import { buildHealthView } from "../../../../server/services/health.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildHealthView(user.id) });
});
