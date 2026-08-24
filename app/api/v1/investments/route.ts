/**
 * `GET  /api/v1/investments` — carteira com rentabilidade e distribuição.
 * `POST /api/v1/investments` — cadastra um ativo, ou registra movimento nele.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import {
  buildInvestmentsView,
  createInvestment,
  recordMovement,
  revalue,
} from "../../../../server/services/investments.ts";

export const dynamic = "force-dynamic";

const CLASSES = ["fixed_income", "variable_income", "fund", "crypto", "real_estate", "other"] as const;
const LIQUIDEZ = ["daily", "scheduled", "maturity"] as const;
const MOVIMENTOS = ["contribution", "withdrawal", "yield"] as const;

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildInvestmentsView(user.id) });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  // `investmentId` distingue "mexer num ativo existente" de "criar um novo".
  const investmentId = input.optionalReference("investmentId");

  if (investmentId) {
    const kind = input.optionalChoice("kind", MOVIMENTOS);
    const amount = input.money("amount");
    const occurredOn = input.optionalDate("occurredOn");
    const note = input.optionalString("note", { max: 200 });
    input.done();

    if (kind) await recordMovement(user.id, investmentId, { kind, amount, occurredOn, note });
    else await revalue(user.id, investmentId, amount);

    return json({ data: { ok: true } }, { status: 201 });
  }

  const payload = {
    name: input.string("name", { max: 80 }),
    institution: input.optionalString("institution", { max: 60 }),
    assetClass: input.optionalChoice("assetClass", CLASSES) ?? "fixed_income",
    liquidity: input.optionalChoice("liquidity", LIQUIDEZ) ?? "daily",
    maturityDate: input.optionalDate("maturityDate"),
    principal: input.money("principal"),
    currentValue: input.optionalMoney("currentValue"),
    accountId: input.optionalReference("accountId"),
  };

  input.done();

  const id = await createInvestment(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
