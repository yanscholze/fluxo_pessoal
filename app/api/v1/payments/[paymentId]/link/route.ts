/**
 * `POST /api/v1/payments/:id/link` — dá baixa na parcela apontando para uma
 * receita que já está no razão.
 *
 * O irmão desta rota, `/receive`, **cria** a receita. As duas existem porque
 * as duas situações existem: dinheiro que entra agora, e dinheiro que já tinha
 * entrado antes de o projeto ser cadastrado — importado do extrato, por
 * exemplo. Usar `/receive` no segundo caso dobraria a renda do mês.
 */

import { requireUser } from "../../../../../../server/auth/session.ts";
import { read } from "../../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../server/http/route-params.ts";
import { linkPaymentToTransaction } from "../../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const paymentId = segmentAfter(request, "payments");
  const input = read(await readJson(request));
  const transactionId = input.reference("transactionId");
  input.done();

  const resultado = await linkPaymentToTransaction(user.id, paymentId, transactionId);
  return json({ data: resultado });
});
