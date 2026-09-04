/**
 * `PATCH  /api/v1/cards/:id` — marca como principal.
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
import { archiveCard, setPrimaryCard } from "../../../../../server/services/catalog.ts";

export const dynamic = "force-dynamic";

function idOf(request: Request): string {
  return segmentAfter(request, "cards");
}

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const cardId = idOf(request);
  const input = read(await readJson(request));

  const isPrimary = input.optionalChoice("isPrimary", ["true"] as const);
  input.done();

  // Só o valor `true` é aceito: "principal" é exclusivo, e desmarcar sem
  // apontar o substituto deixaria a janela do livre para gastar sem dono.
  if (isPrimary === "true") await setPrimaryCard(user.id, cardId);

  return json({ data: { ok: true } });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  await archiveCard(user.id, idOf(request));
  return noContent();
});
