import { asc, desc, eq } from "drizzle-orm";
import { developerFeedback, mobileDevices, userProfiles, users } from "../../../../db/schema";
import { ensureFinanceSchema } from "../../../../db/ensure-schema";
import { getDb } from "../../../../db";
import { apiIdentityFrom, apiUnauthorized } from "../../../../lib/api-v1-auth";
import { assertSameOrigin, clearedSessionCookie, replacePassword, updateUserName } from "../../../../lib/app-auth";

const headers = { "cache-control": "no-store", "x-fluxo-api-version": "1" };

async function developerOwnerId() {
  const first = (await getDb().select({ id: users.id }).from(users).orderBy(asc(users.createdAt)).limit(1))[0];
  return first?.id ?? null;
}

function validAvatar(value: unknown) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 420_000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) throw new Error("INVALID_AVATAR");
  return value;
}

async function profilePayload(ownerId: string) {
  const db = getDb();
  const [user, profile, developerId] = await Promise.all([
    db.select({ id: users.id, email: users.email, displayName: users.displayName }).from(users).where(eq(users.id, ownerId)).limit(1),
    db.select().from(userProfiles).where(eq(userProfiles.ownerId, ownerId)).limit(1),
    developerOwnerId(),
  ]);
  const isDeveloper = developerId === ownerId;
  const feedback = await db.select().from(developerFeedback)
    .where(isDeveloper ? undefined : eq(developerFeedback.senderOwnerId, ownerId))
    .orderBy(desc(developerFeedback.createdAt)).limit(isDeveloper ? 100 : 20);
  return { user: { ...user[0], avatarData: profile[0]?.avatarData ?? null }, isDeveloper, feedback };
}

export async function GET(request: Request) {
  const identity = await apiIdentityFrom(request);
  if (!identity) return apiUnauthorized();
  await ensureFinanceSchema();
  return Response.json(await profilePayload(identity.ownerId), { headers });
}

export async function POST(request: Request) {
  const identity = await apiIdentityFrom(request);
  if (!identity) return apiUnauthorized();
  try {
    assertSameOrigin(request);
    await ensureFinanceSchema();
    const payload = await request.json() as { action?: unknown; displayName?: unknown; avatarData?: unknown; currentPassword?: unknown; nextPassword?: unknown; message?: unknown; feedbackId?: unknown; status?: unknown };
    const action = typeof payload.action === "string" ? payload.action : "";
    const db = getDb();
    if (action === "profile") {
      if (typeof payload.displayName === "string") await updateUserName(identity.ownerId, payload.displayName);
      if (payload.avatarData !== undefined) {
        const avatarData = validAvatar(payload.avatarData);
        await db.insert(userProfiles).values({ ownerId: identity.ownerId, avatarData, updatedAt: new Date().toISOString() })
          .onConflictDoUpdate({ target: userProfiles.ownerId, set: { avatarData, updatedAt: new Date().toISOString() } });
      }
      return Response.json(await profilePayload(identity.ownerId), { headers });
    }
    if (action === "password") {
      await replacePassword(identity.ownerId, typeof payload.currentPassword === "string" ? payload.currentPassword : "", typeof payload.nextPassword === "string" ? payload.nextPassword : "");
      const now = new Date().toISOString();
      await db.update(mobileDevices).set({ revokedAt: now, updatedAt: now }).where(eq(mobileDevices.ownerId, identity.ownerId));
      return Response.json({ ok: true, requiresLogin: true }, { headers: { ...headers, ...(identity.kind === "sites" ? { "set-cookie": clearedSessionCookie(request.url) } : {}) } });
    }
    if (action === "feedback") {
      const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 2000) : "";
      if (message.length < 5) return Response.json({ error: "Escreva um pouco mais sobre a sugestão" }, { status: 400, headers });
      const sender = (await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, identity.ownerId)).limit(1))[0];
      await db.insert(developerFeedback).values({ id: crypto.randomUUID(), senderOwnerId: identity.ownerId, senderName: sender?.displayName ?? "Usuário", message, status: "new", updatedAt: new Date().toISOString() });
      return Response.json(await profilePayload(identity.ownerId), { status: 201, headers });
    }
    if (action === "feedback-status") {
      if (await developerOwnerId() !== identity.ownerId) return Response.json({ error: "Acesso restrito" }, { status: 403, headers });
      const feedbackId = typeof payload.feedbackId === "string" ? payload.feedbackId : "";
      const status = ["new", "reviewing", "planned", "done"].includes(String(payload.status)) ? String(payload.status) : "reviewing";
      await db.update(developerFeedback).set({ status, updatedAt: new Date().toISOString() }).where(eq(developerFeedback.id, feedbackId));
      return Response.json(await profilePayload(identity.ownerId), { headers });
    }
    return Response.json({ error: "Ação inválida" }, { status: 400, headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PROFILE_FAILED";
    if (code === "INVALID_DISPLAY_NAME") return Response.json({ error: "Informe um nome válido" }, { status: 400, headers });
    if (code === "INVALID_PASSWORD") return Response.json({ error: "A nova senha deve ter entre 10 e 128 caracteres" }, { status: 400, headers });
    if (code === "CURRENT_PASSWORD_INVALID") return Response.json({ error: "A senha atual está incorreta" }, { status: 401, headers });
    if (code === "INVALID_AVATAR") return Response.json({ error: "A foto precisa ser JPG, PNG ou WebP e ter até 300 KB" }, { status: 400, headers });
    console.error("[fluxo:profile]", { code });
    return Response.json({ error: "Não foi possível atualizar o perfil" }, { status: 500, headers });
  }
}
