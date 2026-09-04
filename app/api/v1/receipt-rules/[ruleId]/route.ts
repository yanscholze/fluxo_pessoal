/**
 * `PATCH  /api/v1/receipt-rules/:id` — liga e desliga.
 * `DELETE /api/v1/receipt-rules/:id` — remove.
 *
 * Desligar preserva o histórico de conciliações que a regra já produziu;
 * remover apaga a regra e deixa as conciliações apontando para lugar nenhum,
 * o que é aceitável porque elas já viraram lançamento ou já foram descartadas.
 */

import { notFound } from "../../../../../core/kernel/errors.ts";
import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, noContent, readJson } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { removeReceiptRule, setReceiptRuleActive } from "../../../../../server/services/reconciliation.ts";

export const dynamic = "force-dynamic";

function idOf(request: Request): string {
  return segmentAfter(request, "receipt-rules");
}

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const ativa = input.choice("isActive", ["true", "false"] as const);
  input.done();

  await setReceiptRuleActive(user.id, idOf(request), ativa === "true");
  return json({ data: { ok: true } });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  const ruleId = idOf(request);

  if (!(await removeReceiptRule(user.id, ruleId))) throw notFound("Regra de recebimento", ruleId);
  return noContent();
});
