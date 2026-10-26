/**
 * `GET /api/v1/alerts` — o que vale interromper o usuário para dizer.
 *
 * O cliente pergunta; o servidor decide o que há para falar. O aplicativo não
 * reimplementa nenhuma regra: se ele decidisse sozinho o que é urgente, dois
 * dispositivos avisariam coisas diferentes sobre o mesmo dinheiro.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { validationError } from "../../../../core/kernel/errors.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { buildNotificationsView, markNotificationsRead } from "../../../../server/services/notifications.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildNotificationsView(user.id) });
});

/** Abrir a central nunca marca como lida; esta é a única ação de leitura. */
export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  if (body.all === true) {
    await markNotificationsRead(user.id, "all");
  } else {
    if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.length > 80 ||
      !body.ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 80)) {
      throw validationError("Informe até 80 notificações ou use marcar todas como lidas.");
    }
    await markNotificationsRead(user.id, body.ids as string[]);
  }
  return json({ data: await buildNotificationsView(user.id) });
});
