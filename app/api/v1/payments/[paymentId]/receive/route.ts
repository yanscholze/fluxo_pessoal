/**
 * `POST /api/v1/payments/:id/receive` — marca a parcela como recebida.
 *
 * É a costura entre as duas metades do Fluxo: além de dar baixa na parcela,
 * cria a **receita no razão**, na conta escolhida. Sem esse lançamento o
 * dinheiro do trabalho não apareceria no saldo nem no patrimônio.
 */

import { requireUser } from "../../../../../../server/auth/session.ts";
import { read } from "../../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../server/http/route-params.ts";
import { receivePayment } from "../../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const paymentId = segmentAfter(request, "payments");
  const input = read(await readJson(request));

  const payload = {
    accountId: input.reference("accountId"),
    receivedOn: input.optionalDate("receivedOn"),
    categoryId: input.optionalReference("categoryId"),
  };
  input.done();

  const resultado = await receivePayment(user.id, paymentId, payload);
  return json({ data: resultado });
});
