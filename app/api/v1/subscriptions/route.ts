/**
 * `POST /api/v1/subscriptions` — cadastra uma assinatura.
 *
 * Assinatura é recorrência com papel próprio; esta rota existe para a tela de
 * Assinaturas não precisar conhecer o formato de recorrência, que carrega
 * agendamento por dia útil, modo de valor e vigência — nada disso faz sentido
 * numa cobrança mensal de streaming.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { buildSubscriptionsReport, createSubscription } from "../../../../server/services/subscriptions.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const report = await buildSubscriptionsReport(user.id);
  return json({ data: report });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const payload = {
    description: input.string("description", { max: 120 }),
    amount: input.money("amount"),
    scheduleDay: input.integer("scheduleDay", { min: 1, max: 31 }),
    cardId: input.optionalReference("cardId"),
    accountId: input.optionalReference("accountId"),
    categoryId: input.optionalReference("categoryId"),
    labelId: input.optionalReference("labelId"),
    interval: input.optionalChoice("interval", ["monthly", "yearly"] as const) ?? undefined,
  };
  input.done();

  const id = await createSubscription(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
