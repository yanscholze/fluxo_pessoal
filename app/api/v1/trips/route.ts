/**
 * `GET  /api/v1/trips` — viagens com gasto total e quebra por categoria.
 * `POST /api/v1/trips` — cria uma viagem.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { buildTripsView, createTrip } from "../../../../server/services/trips.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildTripsView(user.id) });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const name = input.string("name", { max: 80 });
  const startDate = input.date("startDate");
  const endDate = input.date("endDate");
  const currency = input.string("currency", { max: 3 });
  // A cotação vem como texto digitado em pt-BR ("5,43"); `money` já resolve o
  // separador, e dividimos por cem para voltar ao número.
  const exchangeRate = input.money("exchangeRate") / 100;

  input.done();

  const id = await createTrip(user.id, { name, startDate, endDate, currency, exchangeRate });
  return json({ data: { id } }, { status: 201 });
});
