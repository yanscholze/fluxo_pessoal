import { and, eq, gt, isNull } from "drizzle-orm";
import { ensureFinanceSchema } from "../db/ensure-schema";
import { getDb } from "../db";
import { authRateLimits, users, webSessions } from "../db/schema";

export const WEB_SESSION_COOKIE = "fluxo_session";
export const WEB_SESSION_DAYS = 30;
// Cloudflare Workers currently rejects a single PBKDF2 operation above 100,000 iterations.
export const PASSWORD_ITERATIONS = 100000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 15 * 60 * 1000;

export type FluxoUser = {
  id: string;
  email: string;
  displayName: string;
};

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesFromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(size = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(size)));
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string) {
  const email = normalizeEmail(value);
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(value: string) {
  return value.length >= 10 && value.length <= 128;
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    material,
    256,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function createPasswordRecord(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return {
    passwordHash: base64Url(hash),
    passwordSalt: base64Url(salt),
    passwordIterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(password: string, record: { passwordHash: string; passwordSalt: string; passwordIterations: number }) {
  const actual = await derivePassword(password, bytesFromBase64Url(record.passwordSalt), record.passwordIterations);
  return constantTimeEqual(actual, bytesFromBase64Url(record.passwordHash));
}

export async function hashSessionToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return base64Url(new Uint8Array(digest));
}

async function loginLimitKeys(request: Request, email: string) {
  const forwarded = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return [
    { keyHash: await hashSessionToken(`login:email:${normalizeEmail(email)}`), scope: "email", threshold: 12 },
    { keyHash: await hashSessionToken(`login:network:${forwarded}`), scope: "network", threshold: 40 },
  ];
}

export async function assertLoginAllowed(request: Request, email: string) {
  await ensureFinanceSchema();
  const now = Date.now();
  const db = getDb();
  for (const key of await loginLimitKeys(request, email)) {
    const row = (await db.select().from(authRateLimits).where(eq(authRateLimits.keyHash, key.keyHash)).limit(1))[0];
    if (row?.blockedUntil && Date.parse(row.blockedUntil) > now) throw new Error("AUTH_RATE_LIMITED");
  }
}

export async function recordLoginFailure(request: Request, email: string) {
  await ensureFinanceSchema();
  const db = getDb();
  const now = new Date();
  for (const key of await loginLimitKeys(request, email)) {
    const existing = (await db.select().from(authRateLimits).where(eq(authRateLimits.keyHash, key.keyHash)).limit(1))[0];
    const insideWindow = existing && now.getTime() - Date.parse(existing.windowStartedAt) < LOGIN_WINDOW_MS;
    const failures = insideWindow ? existing.failures + 1 : 1;
    const blockedUntil = failures >= key.threshold ? new Date(now.getTime() + LOGIN_BLOCK_MS).toISOString() : null;
    const values = {
      scope: key.scope,
      failures,
      windowStartedAt: insideWindow ? existing.windowStartedAt : now.toISOString(),
      blockedUntil,
      updatedAt: now.toISOString(),
    };
    await db.insert(authRateLimits).values({ keyHash: key.keyHash, ...values }).onConflictDoUpdate({ target: authRateLimits.keyHash, set: values });
  }
}

export async function clearLoginFailures(request: Request, email: string) {
  const [emailKey] = await loginLimitKeys(request, email);
  await getDb().delete(authRateLimits).where(eq(authRateLimits.keyHash, emailKey.keyHash));
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const item of cookie.split(";")) {
    const [key, ...parts] = item.trim().split("=");
    if (key === name) return decodeURIComponent(parts.join("="));
  }
  return null;
}

function sessionExpiry(days = WEB_SESSION_DAYS) {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + days);
  return expiresAt.toISOString();
}

export function sessionCookie(token: string, requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${WEB_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${WEB_SESSION_DAYS * 86400}`;
}

export function clearedSessionCookie(requestUrl: string) {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${WEB_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=0`;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new Error("ORIGIN_MISMATCH");
}

export async function createWebSession(userId: string) {
  await ensureFinanceSchema();
  const token = randomToken();
  const tokenHash = await hashSessionToken(token);
  const now = new Date().toISOString();
  await getDb().insert(webSessions).values({
    id: `${userId}:web:${randomToken(12)}`,
    userId,
    tokenHash,
    expiresAt: sessionExpiry(),
    lastSeenAt: now,
    updatedAt: now,
  });
  return token;
}

export async function webIdentityFrom(request: Request): Promise<FluxoUser | null> {
  const token = cookieValue(request, WEB_SESSION_COOKIE);
  if (!token) return null;
  await ensureFinanceSchema();
  const now = new Date().toISOString();
  const tokenHash = await hashSessionToken(token);
  const db = getDb();
  const session = (await db.select().from(webSessions).where(and(
    eq(webSessions.tokenHash, tokenHash),
    isNull(webSessions.revokedAt),
    gt(webSessions.expiresAt, now),
  )).limit(1))[0];
  if (!session) return null;
  const user = (await db.select().from(users).where(eq(users.id, session.userId)).limit(1))[0];
  if (!user) return null;
  if (Date.now() - Date.parse(session.lastSeenAt) > 60 * 60 * 1000) {
    await db.update(webSessions).set({ lastSeenAt: now, updatedAt: now }).where(eq(webSessions.id, session.id));
  }
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function revokeWebSession(request: Request) {
  const token = cookieValue(request, WEB_SESSION_COOKIE);
  if (!token) return;
  await ensureFinanceSchema();
  const tokenHash = await hashSessionToken(token);
  const now = new Date().toISOString();
  await getDb().update(webSessions).set({ revokedAt: now, updatedAt: now }).where(eq(webSessions.tokenHash, tokenHash));
}

export async function findUserByEmail(email: string) {
  await ensureFinanceSchema();
  return (await getDb().select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1))[0] ?? null;
}

export async function registerUser(input: { email: string; displayName: string; password: string }) {
  await ensureFinanceSchema();
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim().slice(0, 80);
  if (!validateEmail(email) || displayName.length < 2 || !validatePassword(input.password)) throw new Error("INVALID_REGISTRATION");
  if (await findUserByEmail(email)) throw new Error("EMAIL_IN_USE");
  const password = await createPasswordRecord(input.password);
  const now = new Date().toISOString();
  const user = { id: email, email, displayName };
  await getDb().insert(users).values({ ...user, ...password, updatedAt: now });
  return user;
}

export async function authenticateUser(email: string, password: string) {
  const user = await findUserByEmail(email);
  if (!user) {
    await derivePassword(password, new Uint8Array(16), PASSWORD_ITERATIONS);
    return null;
  }
  if (!await verifyPassword(password, user)) return null;
  return { id: user.id, email: user.email, displayName: user.displayName } satisfies FluxoUser;
}

export async function updateUserName(userId: string, displayNameInput: string) {
  const displayName = displayNameInput.trim().replace(/\s+/g, " ").slice(0, 80);
  if (displayName.length < 2) throw new Error("INVALID_DISPLAY_NAME");
  const now = new Date().toISOString();
  await getDb().update(users).set({ displayName, updatedAt: now }).where(eq(users.id, userId));
  return displayName;
}

export async function replacePassword(userId: string, currentPassword: string, nextPassword: string) {
  if (!validatePassword(nextPassword)) throw new Error("INVALID_PASSWORD");
  const db = getDb();
  const user = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (!user || !await verifyPassword(currentPassword, user)) throw new Error("CURRENT_PASSWORD_INVALID");
  const password = await createPasswordRecord(nextPassword);
  const now = new Date().toISOString();
  await db.update(users).set({ ...password, updatedAt: now }).where(eq(users.id, userId));
  await db.update(webSessions).set({ revokedAt: now, updatedAt: now }).where(and(eq(webSessions.userId, userId), isNull(webSessions.revokedAt)));
  return true;
}
