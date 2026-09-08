/**
 * `GET /api/v1/payments/unlinked-income` — as receitas que ainda não quitaram
 * parcela nenhuma.
 *
 * É o que a tela oferece na hora de vincular. Filtrar no servidor evita
 * oferecer um lançamento já usado e receber o erro depois, no meio do gesto.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { handle, json } from "../../../../../server/http/respond.ts";
import { unlinkedIncome } from "../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: { transactions: await unlinkedIncome(user.id) } });
});
