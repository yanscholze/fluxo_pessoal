import { and, desc, eq, isNull } from "drizzle-orm";
import { appNotifications, pushSubscriptions } from "../../../../db/schema";
import { ensureFinanceSchema } from "../../../../db/ensure-schema";
import { getDb } from "../../../../db";
import { apiIdentityFrom, apiUnauthorized } from "../../../../lib/api-v1-auth";
import { assertSameOrigin } from "../../../../lib/app-auth";

const headers = { "cache-control": "no-store", "x-fluxo-api-version": "1" };
async function responsePayload(ownerId: string) {
  const db = getDb();
  const [items, unread] = await Promise.all([db.select().from(appNotifications).where(eq(appNotifications.ownerId, ownerId)).orderBy(desc(appNotifications.createdAt)).limit(60), db.select({ id: appNotifications.id }).from(appNotifications).where(and(eq(appNotifications.ownerId, ownerId), isNull(appNotifications.readAt)))]);
  return { notifications: items, unreadCount: unread.length };
}
function validExpoPushToken(value: unknown) { return typeof value === "string" && value.length <= 240 && /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9._=-]+\]$/.test(value) ? value : null; }

export async function GET(request: Request) {
  const identity = await apiIdentityFrom(request); if (!identity) return apiUnauthorized();
  await ensureFinanceSchema(); return Response.json(await responsePayload(identity.ownerId), { headers });
}
export async function POST(request: Request) {
  const identity = await apiIdentityFrom(request); if (!identity) return apiUnauthorized();
  try {
    assertSameOrigin(request); await ensureFinanceSchema();
    const input = await request.json() as Record<string, unknown>; const action = typeof input.action === "string" ? input.action : ""; const db = getDb();
    if (action === "mark-read") { const id = typeof input.id === "string" ? input.id : ""; await db.update(appNotifications).set({ readAt: new Date().toISOString() }).where(and(eq(appNotifications.id, id), eq(appNotifications.ownerId, identity.ownerId))); return Response.json(await responsePayload(identity.ownerId), { headers }); }
    if (action === "mark-all-read") { await db.update(appNotifications).set({ readAt: new Date().toISOString() }).where(and(eq(appNotifications.ownerId, identity.ownerId), isNull(appNotifications.readAt))); return Response.json(await responsePayload(identity.ownerId), { headers }); }
    if (action === "register-push") {
      if (identity.kind !== "mobile" || !identity.deviceId) return Response.json({ error: "Registro disponível somente no aplicativo" }, { status: 403, headers });
      const token = validExpoPushToken(input.expoPushToken); if (!token) return Response.json({ error: "Token de notificação inválido" }, { status: 400, headers });
      const now = new Date().toISOString(); await db.delete(pushSubscriptions).where(eq(pushSubscriptions.expoPushToken, token));
      await db.insert(pushSubscriptions).values({ id: `${identity.ownerId}:push:${identity.deviceId}`, ownerId: identity.ownerId, deviceId: identity.deviceId, expoPushToken: token, platform: "android", active: true, lastRegisteredAt: now, updatedAt: now }).onConflictDoUpdate({ target: [pushSubscriptions.ownerId, pushSubscriptions.deviceId], set: { expoPushToken: token, active: true, lastRegisteredAt: now, updatedAt: now } });
      return Response.json({ ok: true }, { headers });
    }
    if (action === "unregister-push") { if (identity.deviceId) await db.update(pushSubscriptions).set({ active: false, updatedAt: new Date().toISOString() }).where(and(eq(pushSubscriptions.ownerId, identity.ownerId), eq(pushSubscriptions.deviceId, identity.deviceId))); return Response.json({ ok: true }, { headers }); }
    return Response.json({ error: "Ação inválida" }, { status: 400, headers });
  } catch (error) { console.error("[fluxo:notifications]", { message: error instanceof Error ? error.message : String(error) }); return Response.json({ error: "Não foi possível atualizar as notificações" }, { status: 500, headers }); }
}
