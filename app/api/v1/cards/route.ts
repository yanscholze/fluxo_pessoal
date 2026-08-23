/**
 * `GET /api/v1/cards` — cartões com fatura e limite calculados.
 * `POST /api/v1/cards` — cadastra um cartão.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { buildDashboard } from "../../../../server/services/dashboard.ts";
import { createCard } from "../../../../server/services/catalog.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  // Cartão sem fatura e sem limite disponível não diz nada útil, e esses dois
  // números são exatamente o que o painel já calcula.
  const dashboard = await buildDashboard(user.id);
  return json({ data: dashboard.cards });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const payload = {
    name: input.string("name", { max: 60 }),
    kind: input.choice("kind", ["credit", "debit"] as const),
    paymentAccountId: input.reference("paymentAccountId"),
    closingDay: input.integer("closingDay", { min: 1, max: 31 }),
    dueDay: input.integer("dueDay", { min: 1, max: 31 }),
    dueAdjustment: input.optionalChoice("dueAdjustment", ["previous", "next"] as const) ?? "next",
    limit: input.optionalMoney("limit"),
    brand: input.optionalString("brand", { max: 40 }),
    tier: input.optionalString("tier", { max: 40 }),
    last4: input.optionalString("last4", { max: 4 }),
    color: input.optionalString("color", { max: 9 }),
    isPrimary: input.boolean("isPrimary", false),
    rewardMode: input.optionalChoice("rewardMode", ["none", "points", "cashback", "both"] as const) ?? "none",
    pointsPerDollarMilli: input.optionalInteger("pointsPerDollarMilli", { min: 0, max: 1_000_000 }),
    cashbackBasisPoints: input.optionalInteger("cashbackBasisPoints", { min: 0, max: 10_000 }),
    pointsGoal: input.optionalInteger("pointsGoal", { min: 0 }),
    manualUsdRateMicros: input.optionalInteger("manualUsdRateMicros", { min: 0 }),
  };

  input.done();

  const id = await createCard(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
