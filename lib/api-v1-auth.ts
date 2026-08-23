import { and, eq, isNull, gt } from "drizzle-orm";
import { ensureFinanceSchema } from "../db/ensure-schema";
import { getDb } from "../db";
import { mobileDevices } from "../db/schema";
import { hashMobileToken, parseBearerToken } from "./mobile-auth";
import { webIdentityFrom } from "./app-auth";

export type ApiIdentity = {
  ownerId: string;
  kind: "sites" | "mobile";
  deviceId?: string;
};

export async function sitesOwnerFrom(request: Request) {
  return (await webIdentityFrom(request))?.id ?? null;
}

export async function apiIdentityFrom(request: Request): Promise<ApiIdentity | null> {
  const sitesOwner = await sitesOwnerFrom(request);
  if (sitesOwner) return { ownerId: sitesOwner, kind: "sites" };

  const token = parseBearerToken(request);
  if (!token) return null;
  await ensureFinanceSchema();

  const now = new Date().toISOString();
  const tokenHash = await hashMobileToken(token);
  const db = getDb();
  const device = (await db.select().from(mobileDevices).where(and(
    eq(mobileDevices.tokenHash, tokenHash),
    isNull(mobileDevices.revokedAt),
    gt(mobileDevices.expiresAt, now),
  )).limit(1))[0];
  if (!device) return null;

  const lastSeen = Date.parse(device.lastSeenAt);
  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > 60 * 60 * 1000) {
    await db.update(mobileDevices).set({ lastSeenAt: now, updatedAt: now }).where(eq(mobileDevices.id, device.id));
  }
  return { ownerId: device.ownerId, kind: "mobile", deviceId: device.deviceId };
}

export function apiUnauthorized() {
  return Response.json({
    error: "Autenticação obrigatória",
    code: "AUTH_REQUIRED",
    message: "Conecte novamente este aparelho pelo Fluxo.",
  }, { status: 401, headers: { "cache-control": "no-store", "x-fluxo-api-version": "1" } });
}
