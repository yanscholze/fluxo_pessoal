/**
 * `GET  /api/v1/receipt-rules` — quem paga o quê.
 * `POST /api/v1/receipt-rules` — cadastra um pagador reconhecido.
 *
 * Aponta-se o pagador uma vez; não há automação a montar por evento. A régua
 * do que vira baixa sozinha e do que espera revisão é do domínio, igual para
 * todos, e não se configura aqui.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { createReceiptRule, listReceiptRules } from "../../../../server/services/reconciliation.ts";

export const dynamic = "force-dynamic";

const ALVOS = ["project", "salary", "benefit"] as const;

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const regras = await listReceiptRules(user.id);

  return json({
    data: regras.map((regra) => ({
      id: regra.id,
      payerName: regra.payerName,
      target: regra.target,
      projectId: regra.projectId,
      accountId: regra.accountId,
      categoryId: regra.categoryId,
      isActive: regra.isActive,
      lastMatchedAt: regra.lastMatchedAt,
    })),
  });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const payload = {
    payerName: input.string("payerName", { max: 120 }),
    target: input.choice("target", ALVOS),
    projectId: input.optionalReference("projectId"),
    accountId: input.reference("accountId"),
    categoryId: input.optionalReference("categoryId"),
  };
  input.done();

  const id = await createReceiptRule(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
