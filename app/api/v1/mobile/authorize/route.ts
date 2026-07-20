import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { ensureFinanceSchema } from "../../../../../db/ensure-schema";
import { getDb } from "../../../../../db";
import { mobileDevices } from "../../../../../db/schema";
import { sitesOwnerFrom } from "../../../../../lib/api-v1-auth";
import { createMobileToken, hashMobileToken, mobileCallbackUrl, mobileSessionExpiry, parseMobileAuthorizationInput } from "../../../../../lib/mobile-auth";
import { SYNC_API_VERSION } from "../../../../../lib/sync-v1";

const responseHeaders = { "cache-control": "no-store", "x-fluxo-api-version": SYNC_API_VERSION };

function unauthorized() {
  return Response.json({ error: "Abra esta página depois de entrar no Fluxo" }, { status: 401, headers: responseHeaders });
}

function gatewayToken() {
  return (env as unknown as { MOBILE_GATEWAY_TOKEN?: string }).MOBILE_GATEWAY_TOKEN?.trim() || null;
}

export async function GET(request: Request) {
  const ownerId = await sitesOwnerFrom(request);
  if (!ownerId) return unauthorized();
  try {
    await ensureFinanceSchema();
    const rows = await getDb().select().from(mobileDevices)
      .where(eq(mobileDevices.ownerId, ownerId))
      .orderBy(desc(mobileDevices.lastSeenAt));
    return Response.json({ devices: rows.map((row) => ({
      id: row.deviceId,
      name: row.name,
      platform: row.platform,
      appVersion: row.appVersion ?? undefined,
      expiresAt: row.expiresAt,
      lastSeenAt: row.lastSeenAt,
      revokedAt: row.revokedAt ?? undefined,
    })) }, { headers: responseHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao listar aparelhos" }, { status: 500, headers: responseHeaders });
  }
}

export async function POST(request: Request) {
  const ownerId = await sitesOwnerFrom(request);
  if (!ownerId) return unauthorized();
  try {
    await ensureFinanceSchema();
    const parsed = parseMobileAuthorizationInput(await request.json());
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400, headers: responseHeaders });
    const gate = gatewayToken();
    if (!gate) return Response.json({ error: "A conexão móvel ainda não foi ativada no servidor", code: "MOBILE_GATEWAY_NOT_CONFIGURED" }, { status: 503, headers: responseHeaders });

    const token = createMobileToken();
    const tokenHash = await hashMobileToken(token);
    const now = new Date().toISOString();
    const expiresAt = mobileSessionExpiry();
    const id = `${ownerId}:mobile:${parsed.value.deviceId}`;
    await getDb().insert(mobileDevices).values({
      id,
      ownerId,
      deviceId: parsed.value.deviceId,
      name: parsed.value.deviceName,
      platform: "android",
      appVersion: parsed.value.appVersion ?? null,
      tokenHash,
      expiresAt,
      revokedAt: null,
      lastSeenAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: [mobileDevices.ownerId, mobileDevices.deviceId],
      set: {
        name: parsed.value.deviceName,
        appVersion: parsed.value.appVersion ?? null,
        tokenHash,
        expiresAt,
        revokedAt: null,
        lastSeenAt: now,
        updatedAt: now,
      },
    });

    return Response.json({
      callbackUrl: mobileCallbackUrl({ token, gatewayToken: gate, state: parsed.value.state, expiresAt }),
      expiresAt,
    }, { status: 201, headers: responseHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao autorizar o aparelho" }, { status: 500, headers: responseHeaders });
  }
}

export async function DELETE(request: Request) {
  const ownerId = await sitesOwnerFrom(request);
  if (!ownerId) return unauthorized();
  const deviceId = new URL(request.url).searchParams.get("device_id")?.trim() ?? "";
  if (!deviceId) return Response.json({ error: "Aparelho obrigatório" }, { status: 400, headers: responseHeaders });
  try {
    await ensureFinanceSchema();
    const now = new Date().toISOString();
    await getDb().update(mobileDevices).set({ revokedAt: now, updatedAt: now })
      .where(and(eq(mobileDevices.ownerId, ownerId), eq(mobileDevices.deviceId, deviceId)));
    return Response.json({ ok: true }, { headers: responseHeaders });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha ao revogar o aparelho" }, { status: 500, headers: responseHeaders });
  }
}
