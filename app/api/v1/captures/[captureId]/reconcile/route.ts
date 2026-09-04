/**
 * `POST /api/v1/captures/:id/reconcile` — aceita a conciliação sugerida.
 *
 * É o "sim" da fila de revisão. Para projeto, dá baixa na parcela apontada;
 * para salário e benefício, cria a receita na conta que a regra indica.
 */

import { requireUser } from "../../../../../../server/auth/session.ts";
import { handle, json } from "../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../server/http/route-params.ts";
import { acceptReconciliation } from "../../../../../../server/services/reconciliation.ts";

export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const captureId = segmentAfter(request, "captures");

  const resultado = await acceptReconciliation(user.id, captureId);
  return json({ data: resultado });
});
