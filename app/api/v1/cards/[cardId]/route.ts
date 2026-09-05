/**
 * `PATCH  /api/v1/cards/:id` — corrige o cartão e marca como principal.
 * `DELETE /api/v1/cards/:id` — arquiva o cartão.
 *
 * "Principal" não é enfeite: é o cartão cujo ciclo define a janela do **livre
 * para gastar**. Sem esta rota a escolha só existia no momento do cadastro, e
 * quem trocasse de cartão principal na vida real não tinha como contar isso ao
 * Fluxo — o número mais importante do produto continuava medido pelo ciclo
 * errado.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, noContent, readJson } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { archiveCard, setPrimaryCard, updateCard } from "../../../../../server/services/catalog.ts";

export const dynamic = "force-dynamic";

function idOf(request: Request): string {
  return segmentAfter(request, "cards");
}

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const cardId = idOf(request);
  const input = read(await readJson(request));

  const isPrimary = input.optionalBoolean("isPrimary");

  const patch = {
    name: input.optionalString("name", { max: 60 }),
    paymentAccountId: input.optionalReference("paymentAccountId"),
    closingDay: input.optionalInteger("closingDay", { min: 1, max: 31 }),
    dueDay: input.optionalInteger("dueDay", { min: 1, max: 31 }),
    dueAdjustment: input.optionalChoice("dueAdjustment", ["previous", "next"] as const),
    limit: input.optionalMoney("limit"),
    brand: input.optionalString("brand", { max: 40 }),
    tier: input.optionalString("tier", { max: 40 }),
    last4: input.optionalString("last4", { max: 4 }),
    color: input.optionalString("color", { max: 9 }),
    rewardMode: input.optionalChoice("rewardMode", ["none", "points", "cashback", "both"] as const),
    pointsPerDollarMilli: input.optionalInteger("pointsPerDollarMilli", { min: 0, max: 1_000_000 }),
    cashbackBasisPoints: input.optionalInteger("cashbackBasisPoints", { min: 0, max: 10_000 }),
    pointsGoal: input.optionalInteger("pointsGoal", { min: 0 }),
    manualUsdRateMicros: input.optionalInteger("manualUsdRateMicros", { min: 0 }),
  };
  input.done();

  if (Object.values(patch).some((valor) => valor !== null)) {
    await updateCard(user.id, cardId, patch);
  }

  // Só `true` tem efeito: "principal" é exclusivo, e desmarcar sem apontar o
  // substituto deixaria a janela do livre para gastar sem dono.
  if (isPrimary === true) await setPrimaryCard(user.id, cardId);

  return json({ data: { ok: true } });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  await archiveCard(user.id, idOf(request));
  return noContent();
});
