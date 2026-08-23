import { createWebSession, sessionCookie, clearedSessionCookie, assertSameOrigin, assertLoginAllowed, authenticateUser, clearLoginFailures, recordLoginFailure, registerUser, revokeWebSession, webIdentityFrom } from "../../../lib/app-auth";

const headers = { "cache-control": "no-store" };

export async function GET(request: Request) {
  const user = await webIdentityFrom(request);
  if (!user) return Response.json({ authenticated: false }, { status: 401, headers });
  return Response.json({ authenticated: true, user }, { headers });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const payload = await request.json() as { action?: string; email?: string; displayName?: string; password?: string };
    if (payload.action === "logout") {
      await revokeWebSession(request);
      return Response.json({ ok: true }, { headers: { ...headers, "set-cookie": clearedSessionCookie(request.url) } });
    }

    const email = payload.email?.trim() ?? "";
    const password = payload.password ?? "";
    if (payload.action !== "register") await assertLoginAllowed(request, email);
    const user = payload.action === "register"
      ? await registerUser({ email, displayName: payload.displayName ?? "", password })
      : await authenticateUser(email, password);
    if (!user) {
      await recordLoginFailure(request, email);
      return Response.json({ error: "E-mail ou senha incorretos" }, { status: 401, headers });
    }
    if (payload.action !== "register") await clearLoginFailures(request, email);
    const token = await createWebSession(user.id);
    return Response.json({ user }, { status: payload.action === "register" ? 201 : 200, headers: { ...headers, "set-cookie": sessionCookie(token, request.url) } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AUTH_FAILED";
    console.error("[fluxo:web-auth]", error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : { error: String(error) });
    if (code === "ORIGIN_MISMATCH") return Response.json({ error: "Origem da solicitação inválida" }, { status: 403, headers });
    if (code === "AUTH_RATE_LIMITED") return Response.json({ error: "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente." }, { status: 429, headers: { ...headers, "retry-after": "900" } });
    if (code === "EMAIL_IN_USE") return Response.json({ error: "Este e-mail já possui uma conta" }, { status: 409, headers });
    if (code === "INVALID_REGISTRATION") return Response.json({ error: "Use nome válido, e-mail válido e senha com pelo menos 10 caracteres" }, { status: 400, headers });
    return Response.json({ error: "Não foi possível autenticar" }, { status: 500, headers });
  }
}
