/**
 * `GET /api/v1/installments`
 *
 * Parcelamentos em aberto, o quanto já foi quitado e o que vence adiante.
 *
 * A rota de antecipação já existia, mas não havia como **listar** os planos:
 * dava para simular a antecipação de um plano que a tela não sabia mostrar.
 *
 * Rota fina: autentica, chama o serviço, devolve. Nenhuma regra aqui.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { handle, json } from "../../../../server/http/respond.ts";
import { buildInstallmentsView } from "../../../../server/services/installments.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildInstallmentsView(user.id) });
});
