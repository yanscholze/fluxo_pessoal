/**
 * `POST /api/v1/session/password` — troca a senha.
 *
 * Trocar a senha revoga **todas** as sessões, inclusive a que fez o pedido: é
 * o que o usuário espera de uma troca feita porque a senha vazou.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { clearedSessionCookie } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../server/http/respond.ts";
import { changePassword } from "../../../../../server/services/auth.ts";

export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const currentPassword = input.string("currentPassword", { max: 512 });
  const newPassword = input.string("newPassword", { max: 512 });

  input.done();

  await changePassword(user.id, { currentPassword, newPassword });

  const headers = new Headers();
  headers.append("set-cookie", clearedSessionCookie());
  return json({ data: { ok: true } }, { headers });
});
