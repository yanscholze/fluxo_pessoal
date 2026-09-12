/**
 * `POST /api/v1/projects/:id/payments/past` — registra um recebimento que já
 * aconteceu, apontando para a receita que já está no razão.
 *
 * É a terceira forma de dar baixa, e cada uma atende um momento diferente:
 *
 * - `/payments` + `/payments/:id/receive` — a parcela existe e o dinheiro entra
 *   agora. A baixa cria a receita.
 * - `/payments/:id/link` — a parcela existe e o dinheiro já tinha entrado.
 * - **esta** — o dinheiro entrou e a parcela nunca existiu, porque o projeto
 *   nasceu depois do pagamento.
 *
 * Sem ela, quem cadastra um projeto antigo fica sem saída: criar a parcela e
 * dar baixa pelo caminho normal criaria uma segunda receita, dobrando a renda
 * daquele mês.
 */

import { requireUser } from "../../../../../../../server/auth/session.ts";
import { read } from "../../../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../../server/http/route-params.ts";
import { registerPastPayment } from "../../../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const projectId = segmentAfter(request, "projects");
  const input = read(await readJson(request));

  const payload = {
    projectId,
    transactionId: input.reference("transactionId"),
    description: input.optionalString("description", { max: 160 }),
  };
  input.done();

  const resultado = await registerPastPayment(user.id, payload);
  return json({ data: resultado }, { status: 201 });
});
