/**
 * `GET /api/v1/installments/:planId/anticipation`
 *
 * Cenários de antecipação: quanto sai hoje, quanto economiza, quanto libera
 * por mês e quando o parcelamento passa a terminar.
 */

import { requireUser } from "../../../../../../server/auth/session.ts";
import { handle, json } from "../../../../../../server/http/respond.ts";
import { simulatePlanAnticipation } from "../../../../../../server/services/installments.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);

  // O identificador vem do caminho; o Next não o entrega ao handler quando a
  // rota é montada por `handle`, então lemos direto da URL.
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const planId = segments[segments.indexOf("installments") + 1] ?? "";

  const result = await simulatePlanAnticipation(user.id, planId);
  return json({ data: { scenarios: result.scenarios } });
});
