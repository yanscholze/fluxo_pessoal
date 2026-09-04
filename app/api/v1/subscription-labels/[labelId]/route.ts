/**
 * `DELETE /api/v1/subscription-labels/:id` — arquiva uma classificação.
 *
 * Arquiva em vez de apagar: as assinaturas que apontam para ela continuariam
 * apontando para um identificador inexistente, e o relatório do mês passado
 * perderia a divisão que tinha quando foi lido.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { handle, noContent } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { archiveLabel } from "../../../../../server/services/subscriptions.ts";

export const dynamic = "force-dynamic";

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  const labelId = segmentAfter(request, "subscription-labels");

  await archiveLabel(user.id, labelId);
  return noContent();
});
