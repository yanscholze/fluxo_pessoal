/**
 * `GET /api/v1/alerts` — o que vale interromper o usuário para dizer.
 *
 * O cliente pergunta; o servidor decide o que há para falar. O aplicativo não
 * reimplementa nenhuma regra: se ele decidisse sozinho o que é urgente, dois
 * dispositivos avisariam coisas diferentes sobre o mesmo dinheiro.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { handle, json } from "../../../../server/http/respond.ts";
import { buildAlertsView } from "../../../../server/services/alerts.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildAlertsView(user.id) });
});
