/**
 * `POST /api/v1/pairing` — o aplicativo pede um código.
 * `PUT  /api/v1/pairing` — o aplicativo pergunta se já foi aprovado.
 * `PATCH /api/v1/pairing` — o usuário aprova, do navegador autenticado.
 *
 * As duas primeiras são **anônimas**: o aparelho ainda não tem token, e é
 * justamente isso que ele está tentando obter. Quem prova identidade é a
 * sessão web na aprovação.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { approve, claim, purgeExpired, startPairing } from "../../../../server/services/pairing.ts";

export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const input = read(await readJson(request));

  const deviceId = input.string("deviceId", { min: 8, max: 120 });
  const deviceName = input.optionalString("deviceName", { max: 80 });
  const platform = input.optionalString("platform", { max: 32 });
  const appVersion = input.optionalString("appVersion", { max: 40 });

  input.done();

  // Limpeza oportunista: o pedido vencido não serve para nada e some aqui em
  // vez de exigir uma tarefa agendada.
  await purgeExpired();

  const inicio = await startPairing({ id: deviceId, name: deviceName, platform, appVersion });
  return json({ data: inicio }, { status: 201 });
});

export const PUT = handle(async (request: Request) => {
  const input = read(await readJson(request));

  const code = input.string("code", { min: 4, max: 12 });
  const pollToken = input.string("pollToken", { min: 8, max: 120 });

  input.done();

  return json({ data: await claim(code, pollToken) });
});

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const code = input.string("code", { min: 4, max: 12 });
  input.done();

  await approve(user.id, code);
  return json({ data: { ok: true } });
});
