import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { ensureFinanceSchema } from "../../../../db/ensure-schema";
import { getDb } from "../../../../db";
import { mobileDevices, pushSubscriptions } from "../../../../db/schema";
import { assertLoginAllowed, authenticateUser, clearLoginFailures, recordLoginFailure, registerUser } from "../../../../lib/app-auth";
import { apiIdentityFrom } from "../../../../lib/api-v1-auth";
import { createMobileToken, hashMobileToken, mobileSessionExpiry, parseBearerToken } from "../../../../lib/mobile-auth";
import { SYNC_API_VERSION } from "../../../../lib/sync-v1";

const responseHeaders = { "cache-control": "no-store", "x-fluxo-api-version": SYNC_API_VERSION };

function validDevice(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const deviceId = typeof input.deviceId === "string" ? input.deviceId.trim() : "";
  const deviceName = typeof input.deviceName === "string" ? input.deviceName.trim() : "";
  const appVersion = typeof input.appVersion === "string" ? input.appVersion.trim() : "";
  if (!/^[A-Za-z0-9.:_-]{8,160}$/.test(deviceId) || deviceName.length < 2 || deviceName.length > 80 || appVersion.length > 40) return null;
  return { deviceId, deviceName, appVersion: appVersion || undefined };
}

function gatewayToken() {
  return (env as unknown as { MOBILE_GATEWAY_TOKEN?: string }).MOBILE_GATEWAY_TOKEN?.trim() || "";
}

export async function POST(request: Request) {
  try {
    await ensureFinanceSchema();
    const payload = await request.json() as {
      action?: string;
      email?: string;
      displayName?: string;
      password?: string;
      device?: unknown;
    };

    if (payload.action === "logout") {
      const identity = await apiIdentityFrom(request);
      const token = parseBearerToken(request);
      if (identity?.kind === "mobile" && token) {
        const tokenHash = await hashMobileToken(token);
        const now = new Date().toISOString();
        await getDb().update(mobileDevices).set({ revokedAt: now, updatedAt: now }).where(and(
          eq(mobileDevices.ownerId, identity.ownerId),
          eq(mobileDevices.tokenHash, tokenHash),
        ));
        if (identity.deviceId) await getDb().update(pushSubscriptions).set({ active: false, updatedAt: now }).where(and(eq(pushSubscriptions.ownerId, identity.ownerId), eq(pushSubscriptions.deviceId, identity.deviceId)));
      }
      return Response.json({ ok: true }, { headers: responseHeaders });
    }

    const device = validDevice(payload.device);
    if (!device) return Response.json({ error: "Aparelho inválido" }, { status: 400, headers: responseHeaders });
    const email = payload.email?.trim() ?? "";
    const password = payload.password ?? "";
    if (payload.action !== "register") await assertLoginAllowed(request, email);
    const user = payload.action === "register"
      ? await registerUser({ email, displayName: payload.displayName ?? "", password })
      : await authenticateUser(email, password);
    if (!user) {
      await recordLoginFailure(request, email);
      return Response.json({ error: "E-mail ou senha incorretos" }, { status: 401, headers: responseHeaders });
    }
    if (payload.action !== "register") await clearLoginFailures(request, email);

    const deviceToken = createMobileToken();
    const tokenHash = await hashMobileToken(deviceToken);
    const expiresAt = mobileSessionExpiry();
    const now = new Date().toISOString();
    const id = `${user.id}:mobile:${device.deviceId}`;
    await getDb().insert(mobileDevices).values({
      id,
      ownerId: user.id,
      deviceId: device.deviceId,
      name: device.deviceName,
      platform: "android",
      appVersion: device.appVersion ?? null,
      tokenHash,
      expiresAt,
      revokedAt: null,
      lastSeenAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [mobileDevices.ownerId, mobileDevices.deviceId],
      set: {
        name: device.deviceName,
        appVersion: device.appVersion ?? null,
        tokenHash,
        expiresAt,
        revokedAt: null,
        lastSeenAt: now,
        updatedAt: now,
      },
    });

    return Response.json({
      user,
      deviceToken,
      gatewayToken: gatewayToken(),
      expiresAt,
    }, { status: payload.action === "register" ? 201 : 200, headers: responseHeaders });
  } catch (error) {
    const code = error instanceof Error ? error.message : "AUTH_FAILED";
    console.error("[fluxo:mobile-auth]", error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : { error: String(error) });
    if (code === "AUTH_RATE_LIMITED") return Response.json({ error: "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente." }, { status: 429, headers: { ...responseHeaders, "retry-after": "900" } });
    if (code === "EMAIL_IN_USE") return Response.json({ error: "Este e-mail já possui uma conta" }, { status: 409, headers: responseHeaders });
    if (code === "INVALID_REGISTRATION") return Response.json({ error: "Use nome válido, e-mail válido e senha com pelo menos 10 caracteres" }, { status: 400, headers: responseHeaders });
    return Response.json({ error: "Não foi possível autenticar" }, { status: 500, headers: responseHeaders });
  }
}
