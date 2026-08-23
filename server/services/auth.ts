/**
 * Serviço de autenticação.
 *
 * Cadastro, entrada, saída e troca de senha. O limite de tentativas é por
 * identificador, com janela deslizante, e conta tanto o e-mail quanto a
 * origem — sem isso, uma lista de senhas comuns testada contra muitas contas
 * passa despercebida.
 */

import { conflict, notFound, rateLimited, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { and, eq } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import { authAttempts, users } from "../db/schema/index.ts";
import {
  type IssuedSession,
  issueSession,
  revokeAllSessions,
  revokeSession,
} from "../auth/session.ts";
import {
  DEFAULT_ITERATIONS,
  assertAcceptablePassword,
  hashPassword,
  needsRehash,
  verifyPassword,
} from "../auth/password.ts";
import { seedDefaults } from "./catalog.ts";

const MAX_FAILURES = 8;
const WINDOW_MINUTES = 15;
const BLOCK_MINUTES = 15;

export type Credentials = {
  readonly email: string;
  readonly password: string;
};

export type SignUpInput = Credentials & {
  readonly displayName: string;
};

export type AuthResult = {
  readonly user: { id: string; email: string; displayName: string };
  readonly session: IssuedSession;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertEmail(email: string): string {
  const normalized = normalizeEmail(email);
  // Verificação deliberadamente simples: a prova real de que um e-mail existe
  // é conseguir entregar mensagem nele, não casar com uma expressão regular
  // complicada que rejeita endereços válidos.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
    throw validationError("Informe um e-mail válido", [{ path: "email", message: "E-mail inválido" }]);
  }
  return normalized;
}

async function hashKey(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Recusa a tentativa quando o identificador está bloqueado. */
async function assertNotBlocked(scope: string, identifier: string, now: Date): Promise<string> {
  const key = await hashKey(`${scope}:${identifier}`);
  const database = getDatabase();

  const [row] = await database.select().from(authAttempts).where(eq(authAttempts.keyHash, key)).limit(1);

  if (row?.blockedUntil && row.blockedUntil > now.toISOString()) {
    const seconds = Math.ceil((new Date(row.blockedUntil).getTime() - now.getTime()) / 1000);
    throw rateLimited("Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.", seconds);
  }

  return key;
}

async function registerFailure(key: string, scope: string, now: Date): Promise<void> {
  const database = getDatabase();
  const [row] = await database.select().from(authAttempts).where(eq(authAttempts.keyHash, key)).limit(1);

  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60_000).toISOString();
  const withinWindow = row && row.windowStartedAt > windowStart;
  const failures = (withinWindow ? row.failures : 0) + 1;
  const blockedUntil =
    failures >= MAX_FAILURES ? new Date(now.getTime() + BLOCK_MINUTES * 60_000).toISOString() : null;

  await database
    .insert(authAttempts)
    .values({
      keyHash: key,
      scope,
      failures,
      windowStartedAt: withinWindow ? row.windowStartedAt : now.toISOString(),
      blockedUntil,
      updatedAt: now.toISOString(),
    })
    .onConflictDoUpdate({
      target: authAttempts.keyHash,
      set: {
        failures,
        windowStartedAt: withinWindow ? row!.windowStartedAt : now.toISOString(),
        blockedUntil,
        updatedAt: now.toISOString(),
      },
    });
}

async function clearFailures(key: string): Promise<void> {
  await getDatabase().delete(authAttempts).where(eq(authAttempts.keyHash, key));
}

export async function signUp(input: SignUpInput, now: Date = new Date()): Promise<AuthResult> {
  const email = assertEmail(input.email);
  assertAcceptablePassword(input.password);

  const displayName = input.displayName.trim();
  if (!displayName) {
    throw validationError("Informe seu nome", [{ path: "displayName", message: "Campo obrigatório" }]);
  }

  const database = getDatabase();
  const [existing] = await database.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) throw conflict("Já existe uma conta com este e-mail");

  const password = await hashPassword(input.password);
  const userId = newId(now.getTime());

  await database.insert(users).values({
    id: userId,
    email,
    displayName: displayName.slice(0, 80),
    passwordHash: password.hash,
    passwordSalt: password.salt,
    passwordIterations: password.iterations,
  });

  // Uma conta recém-criada abre numa tela vazia que não ensina nada. As
  // categorias padrão dão ponto de partida e podem ser trocadas à vontade.
  await seedDefaults(userId, now);

  const session = await issueSession({ userId, kind: "web", now });
  return { user: { id: userId, email, displayName }, session };
}

export type SignInOptions = {
  readonly kind?: "web" | "device";
  readonly deviceId?: string | null;
  readonly deviceName?: string | null;
  readonly platform?: string | null;
  readonly appVersion?: string | null;
  /** Endereço de origem, para o limite de tentativas. */
  readonly origin?: string | null;
};

export async function signIn(
  credentials: Credentials,
  options: SignInOptions = {},
  now: Date = new Date(),
): Promise<AuthResult> {
  const email = normalizeEmail(credentials.email);
  const emailKey = await assertNotBlocked("signin:email", email, now);
  const originKey = options.origin ? await assertNotBlocked("signin:origin", options.origin, now) : null;

  const database = getDatabase();
  const [record] = await database.select().from(users).where(eq(users.email, email)).limit(1);

  const valid =
    record !== undefined &&
    (await verifyPassword(credentials.password, {
      hash: record.passwordHash,
      salt: record.passwordSalt,
      iterations: record.passwordIterations,
    }));

  if (!valid) {
    await registerFailure(emailKey, "signin:email", now);
    if (originKey) await registerFailure(originKey, "signin:origin", now);
    // Mensagem única para e-mail inexistente e senha errada: dizer qual dos
    // dois falhou entrega ao atacante a lista de e-mails cadastrados.
    throw validationError("E-mail ou senha incorretos", [
      { path: "password", message: "Verifique os dados e tente de novo" },
    ]);
  }

  await clearFailures(emailKey);
  if (originKey) await clearFailures(originKey);

  // Reforça o hash silenciosamente quando o custo padrão sobe.
  if (
    needsRehash({ hash: record.passwordHash, salt: record.passwordSalt, iterations: record.passwordIterations })
  ) {
    const upgraded = await hashPassword(credentials.password, DEFAULT_ITERATIONS);
    await database
      .update(users)
      .set({
        passwordHash: upgraded.hash,
        passwordSalt: upgraded.salt,
        passwordIterations: upgraded.iterations,
        updatedAt: now.toISOString(),
      })
      .where(eq(users.id, record.id));
  }

  const session = await issueSession({
    userId: record.id,
    kind: options.kind ?? "web",
    deviceId: options.deviceId,
    deviceName: options.deviceName,
    platform: options.platform,
    appVersion: options.appVersion,
    now,
  });

  return {
    user: { id: record.id, email: record.email, displayName: record.displayName },
    session,
  };
}

export async function signOut(sessionId: string, now: Date = new Date()): Promise<void> {
  await revokeSession(sessionId, now);
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  now: Date = new Date(),
): Promise<void> {
  assertAcceptablePassword(input.newPassword);

  const database = getDatabase();
  const [record] = await database.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!record) throw notFound("Usuário", userId);

  const valid = await verifyPassword(input.currentPassword, {
    hash: record.passwordHash,
    salt: record.passwordSalt,
    iterations: record.passwordIterations,
  });
  if (!valid) {
    throw validationError("Senha atual incorreta", [
      { path: "currentPassword", message: "Verifique a senha atual" },
    ]);
  }

  const password = await hashPassword(input.newPassword);
  await database
    .update(users)
    .set({
      passwordHash: password.hash,
      passwordSalt: password.salt,
      passwordIterations: password.iterations,
      updatedAt: now.toISOString(),
    })
    .where(and(eq(users.id, userId)));

  // Trocar a senha desconecta todos os aparelhos — é o que o usuário espera de
  // uma troca feita porque a senha vazou.
  await revokeAllSessions(userId, now);
}
