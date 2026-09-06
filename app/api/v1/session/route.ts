/**
 * `GET /api/v1/session` — quem está autenticado.
 * `POST /api/v1/session` — entrar ou criar conta.
 * `DELETE /api/v1/session` — sair.
 *
 * A sessão web viaja em cookie `HttpOnly`; o Android recebe o token no corpo e
 * o guarda no armazenamento seguro do aparelho.
 */

import { optionalUser, requireUser, sessionCookie, clearedSessionCookie } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, noContent, readJson } from "../../../../server/http/respond.ts";
import { signIn, signUp } from "../../../../server/services/auth.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await optionalUser(request);
  return json({
    data: user
      ? { authenticated: true, user: { id: user.id, email: user.email, displayName: user.displayName } }
      : { authenticated: false, user: null },
  });
});

export const POST = handle(async (request: Request) => {
  const body = await readJson(request);
  const input = read(body);

  const action = input.optionalChoice("action", ["signin", "signup"] as const) ?? "signin";
  const email = input.string("email", { max: 254 });
  const password = input.string("password", { max: 512 });
  const displayName = action === "signup" ? input.string("displayName", { max: 80 }) : null;
  const kind = input.optionalChoice("kind", ["web", "device"] as const) ?? "web";
  const deviceName = input.optionalString("deviceName", { max: 80 });
  const platform = input.optionalString("platform", { max: 32 });

  input.done();

  const result =
    action === "signup"
      ? await signUp(
          { email, password, displayName: displayName ?? "" },
          // O aparelho que se cadastra precisa da sessão longa, igual à de
          // quem entra por aqui: ele não tem como renovar sozinho.
          { kind, deviceName, platform },
        )
      : await signIn(
          { email, password },
          {
            kind,
            deviceName,
            platform,
            origin: request.headers.get("cf-connecting-ip"),
          },
        );

  const headers = new Headers();
  // O token só volta no corpo para o aparelho, que não tem cookie. Na web ele
  // fica no cookie `HttpOnly` — fora do alcance de qualquer script da página.
  if (kind === "web") {
    headers.append("set-cookie", sessionCookie(result.session.token, result.session.expiresAt));
  }

  return json(
    {
      data: {
        user: result.user,
        ...(kind === "device"
          ? { token: result.session.token, expiresAt: result.session.expiresAt }
          : { expiresAt: result.session.expiresAt }),
      },
    },
    { status: action === "signup" ? 201 : 200, headers },
  );
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  const { signOut } = await import("../../../../server/services/auth.ts");
  await signOut(user.sessionId);

  const headers = new Headers();
  headers.append("set-cookie", clearedSessionCookie());
  return noContent({ headers });
});
