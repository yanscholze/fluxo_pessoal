/**
 * `GET /api/v1/dashboard`
 *
 * Devolve todos os indicadores da Visão geral **já calculados**. O cliente
 * exibe; não recalcula saldo, fatura nem livre para gastar. Era a recalculagem
 * espalhada pelo cliente que fazia cada tela chegar a um número diferente.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { handle, json } from "../../../../server/http/respond.ts";
import { buildDashboard } from "../../../../server/services/dashboard.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const dashboard = await buildDashboard(user.id);
  return json({ data: dashboard });
});
