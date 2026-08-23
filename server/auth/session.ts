/**
 * Sessões.
 *
 * Uma tabela, dois tipos: `web` viaja em cookie `HttpOnly`, `device` viaja em
 * cabeçalho `Authorization: Bearer`. Expiração, revogação e verificação de
 * token são o mesmo código para os dois — antes eram duas implementações que
 * divergiam.
 *
 * O token em claro só existe no momento em que é emitido. O banco guarda o
 * SHA-256 dele: um vazamento do banco não dá acesso a nenhuma conta.
 */

import { and, eq, gt, isNull } from "drizzle-orm";

import { forbidden } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { getDatabase } from "../db/client.ts";
import { sessions, users } from "../db/schema/index.ts";

export type SessionKind = "web" | "device";

export const WEB_SESSION_DAYS = 30;
export const DEVICE_SESSION_DAYS = 180;

export const SESSION_COOKIE = "fluxo_session";

export type AuthenticatedUser = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly sessionId: string;
  readonly sessionKind: SessionKind;
};

const TOKEN_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function generateToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toBase64Url(new Uint8Array(digest));
}

function expiryFor(kind: SessionKind, now: Date): string {
  const days = kind === "web" ? WEB_SESSION_DAYS : DEVICE_SESSION_DAYS;
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export type IssuedSession = {
  readonly token: string;
  readonly sessionId: string;
  readonly expiresAt: string;
};

export async function issueSession(input: {
  userId: string;
  kind: SessionKind;
  deviceId?: string | null;
  deviceName?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  now?: Date;
}): Promise<IssuedSession> {
  const now = input.now ?? new Date();
  const token = generateToken();
  const sessionId = newId(now.getTime());
  const expiresAt = expiryFor(input.kind, now);

  await getDatabase()
    .insert(sessions)
    .values({
      id: sessionId,
      userId: input.userId,
      kind: input.kind,
      tokenHash: await hashToken(token),
      deviceId: input.deviceId ?? null,
      deviceName: input.deviceName?.slice(0, 80) ?? null,
      platform: input.platform ?? null,
      appVersion: input.appVersion?.slice(0, 40) ?? null,
      expiresAt,
      lastSeenAt: now.toISOString(),
    });

  return { token, sessionId, expiresAt };
}

/**
 * Resolve o usuário a partir de um token.
 *
 * Devolve `null` para token ausente, desconhecido, expirado ou revogado — a
 * borda decide se isso é 401 ou navegação anônima.
 */
export async function resolveSession(token: string | null, now: Date = new Date()): Promise<AuthenticatedUser | null> {
  if (!token) return null;

  const database = getDatabase();
  const [row] = await database
    .select({
      sessionId: sessions.id,
      kind: sessions.kind,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, await hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, now.toISOString()),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    sessionId: row.sessionId,
    sessionKind: row.kind,
  };
}

/** Marca o último uso. Escrita solta de propósito: não vale bloquear a resposta. */
export async function touchSession(sessionId: string, now: Date = new Date()): Promise<void> {
  await getDatabase()
    .update(sessions)
    .set({ lastSeenAt: now.toISOString() })
    .where(eq(sessions.id, sessionId));
}

export async function revokeSession(sessionId: string, now: Date = new Date()): Promise<void> {
  await getDatabase()
    .update(sessions)
    .set({ revokedAt: now.toISOString() })
    .where(eq(sessions.id, sessionId));
}

/** Desconecta todos os aparelhos — usado ao trocar a senha. */
export async function revokeAllSessions(userId: string, now: Date = new Date()): Promise<void> {
  await getDatabase()
    .update(sessions)
    .set({ revokedAt: now.toISOString() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export async function listDeviceSessions(userId: string): Promise<
  Array<{ id: string; deviceName: string | null; platform: string | null; lastSeenAt: string; expiresAt: string }>
> {
  const database = getDatabase();
  return database
    .select({
      id: sessions.id,
      deviceName: sessions.deviceName,
      platform: sessions.platform,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.kind, "device"), isNull(sessions.revokedAt)));
}

// ---------------------------------------------------------------------------
// Leitura da requisição
// ---------------------------------------------------------------------------

export function tokenFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }
  return cookieValue(request.headers.get("cookie"), SESSION_COOKIE);
}

function cookieValue(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim()) || null;
    }
  }
  return null;
}

export function sessionCookie(token: string, expiresAt: string): string {
  const attributes = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ];
  return attributes.join("; ");
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Resolve o usuário ou lança — para rotas que exigem autenticação. */
export async function requireUser(request: Request): Promise<AuthenticatedUser> {
  const user = await resolveSession(tokenFromRequest(request));
  if (!user) throw forbidden("Entre na sua conta para continuar");
  return user;
}

/** Resolve o usuário sem exigir — para páginas que funcionam anônimas. */
export async function optionalUser(request: Request): Promise<AuthenticatedUser | null> {
  return resolveSession(tokenFromRequest(request));
}
