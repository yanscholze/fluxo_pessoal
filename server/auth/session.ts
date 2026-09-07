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

import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";

import { forbidden } from "../../core/kernel/errors.ts";
import { SESSION_COOKIE } from "../../core/kernel/session-cookie.ts";
import { newId } from "../../core/kernel/id.ts";
import { getDatabase } from "../db/client.ts";
import { sessions, users } from "../db/schema/index.ts";

export type SessionKind = "web" | "device";

export const WEB_SESSION_DAYS = 30;

/**
 * Janela de **inatividade** do aparelho, não prazo fixo.
 *
 * Antes eram 180 dias contados da conexão: quem usava todo dia era desconectado
 * no sexto mês sem nenhum motivo, e um aparelho perdido continuava valendo meio
 * ano. Contar do último uso inverte as duas coisas — quem usa não é
 * interrompido, e o que parou de ser usado caduca em um mês.
 */
export const DEVICE_SESSION_DAYS = 30;

/**
 * De quanto em quanto tempo a janela é empurrada para frente.
 *
 * Estender a cada requisição custaria uma escrita por leitura. Uma vez por hora
 * mantém a janela praticamente colada no último uso e deixa o custo desprezível.
 */
const RENOVACAO_MINIMA_MS = 3_600_000;

export { SESSION_COOKIE };

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
    /*
     * Os dois `id` precisam de apelido explícito.
     *
     * `sessions.id` e `users.id` chegam do SQLite com o mesmo nome de coluna, e
     * o segundo sobrescrevia o primeiro: `sessionId` vinha com o id do
     * **usuário**. Passou despercebido porque quase todo uso é o `userId`, que
     * ficava certo — mas quem revogasse a sessão corrente estaria apontando
     * para uma linha que não existe.
     */
    .select({
      sessionId: sql<string>`${sessions.id}`.as("session_id"),
      kind: sessions.kind,
      userId: sql<string>`${users.id}`.as("user_id"),
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

  // O uso empurra a validade do aparelho para frente. Sem isto a janela de
  // inatividade não existiria: ela expiraria no mesmo dia para quem usa todo
  // dia e para quem largou o aparelho na gaveta.
  // O uso empurra a validade do aparelho para frente. Sem isto a janela de
  // inatividade não existiria: expiraria no mesmo dia para quem usa todo dia e
  // para quem largou o aparelho na gaveta.
  //
  // A limitação de frequência vive na própria escrita, e não numa leitura
  // prévia: acrescentar `lastSeenAt` ao `select` com `innerJoin` embaralhava o
  // mapeamento das colunas e `sessionId` passava a vir com o id do usuário.
  if (row.kind === "device") await renewDeviceSession(row.sessionId, now);

  return {
    id: row.userId,
    email: row.email,
    displayName: row.displayName,
    sessionId: row.sessionId,
    sessionKind: row.kind,
  };
}

/**
 * Marca o último uso e empurra a validade do aparelho.
 *
 * As duas coisas andam juntas de propósito: a validade **é** o último uso mais
 * a janela. Gravar uma sem a outra deixaria a lista de aparelhos dizendo "visto
 * hoje" ao lado de uma sessão que expira amanhã.
 */
export async function renewDeviceSession(sessionId: string, now: Date = new Date()): Promise<void> {
  // Só escreve quando o último uso já saiu da janela de renovação. Estender a
  // cada requisição custaria uma escrita por leitura; uma vez por hora deixa a
  // validade praticamente colada no último uso a custo desprezível.
  const limite = new Date(now.getTime() - RENOVACAO_MINIMA_MS).toISOString();

  await getDatabase()
    .update(sessions)
    .set({ lastSeenAt: now.toISOString(), expiresAt: expiryFor("device", now) })
    .where(and(eq(sessions.id, sessionId), lt(sessions.lastSeenAt, limite)));
}

/** Marca o último uso, sem mexer na validade. Para sessão de navegador. */
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
