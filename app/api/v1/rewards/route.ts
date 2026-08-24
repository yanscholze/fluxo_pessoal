/**
 * `GET  /api/v1/rewards` — saldo de pontos e cashback por cartão.
 * `POST /api/v1/rewards` — registra um resgate.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { buildRewardsView, redeem } from "../../../../server/services/rewards.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildRewardsView(user.id) });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const cardId = input.reference("cardId");
  const kind = input.choice("kind", ["points", "cashback"] as const);
  // Pontos chegam em unidade inteira e cashback em texto de dinheiro; as duas
  // viram a menor unidade aqui, que é como o saldo é guardado.
  const amount =
    kind === "points"
      ? Math.round(input.integer("amount", { min: 1 }) * 1000)
      : (input.money("amount") as number);
  const accountId = input.optionalReference("accountId");
  const redeemedOn = input.optionalDate("redeemedOn");
  const note = input.optionalString("note", { max: 180 });

  input.done();

  const result = await redeem(user.id, { cardId, kind, amount, accountId, redeemedOn, note });
  return json({ data: result }, { status: 201 });
});
