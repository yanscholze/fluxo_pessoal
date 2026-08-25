/**
 * Pareamento de aparelho.
 *
 * O aplicativo pede um código curto, o usuário confirma numa página já
 * autenticada no navegador, e o aplicativo troca o código por um token de
 * dispositivo. A senha **nunca** passa pelo aparelho — quem prova identidade é
 * a sessão web que já existe.
 *
 * O código é curto de propósito: precisa ser digitável. O que o protege é a
 * validade de poucos minutos e o limite de tentativas, não o comprimento.
 */

import { conflict, notFound, rateLimited, validationError } from "../../core/kernel/errors.ts";
import { newId } from "../../core/kernel/id.ts";
import { and, eq, gt, isNull } from "drizzle-orm";

import { issueSession } from "../auth/session.ts";
import { getDatabase } from "../db/client.ts";
import { pairingRequests } from "../db/schema/index.ts";

/** Minutos de validade do código. */
const TTL_MINUTES = 10;
/** Tentativas de resgate antes de invalidar. */
const MAX_ATTEMPTS = 5;

/** Alfabeto sem caracteres que se confundem lidos de uma tela: 0/O, 1/I. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export type PairingStart = {
  readonly code: string;
  readonly expiresAt: string;
  readonly pollToken: string;
};

/**
 * O aplicativo inicia o pareamento e recebe o código para o usuário digitar.
 *
 * `pollToken` é secreto e fica só no aparelho: sem ele, quem conhecesse o
 * código exibido na tela poderia consultar o resultado do pareamento.
 */
export async function startPairing(
  device: { id: string; name?: string | null; platform?: string | null; appVersion?: string | null },
  now: Date = new Date(),
): Promise<PairingStart> {
  if (!device.id || device.id.length < 8) {
    throw validationError("Identificador de aparelho inválido", [
      { path: "device.id", message: "Informe o identificador do aparelho" },
    ]);
  }

  const code = generateCode();
  const pollToken = newId(now.getTime());
  const expiresAt = new Date(now.getTime() + TTL_MINUTES * 60_000).toISOString();

  await getDatabase().insert(pairingRequests).values({
    id: newId(now.getTime()),
    code,
    pollToken,
    deviceId: device.id.slice(0, 120),
    deviceName: device.name?.slice(0, 80) ?? null,
    platform: device.platform?.slice(0, 32) ?? "android",
    appVersion: device.appVersion?.slice(0, 40) ?? null,
    expiresAt,
  });

  return { code, expiresAt, pollToken };
}

export type PendingPairing = {
  readonly code: string;
  readonly deviceName: string | null;
  readonly platform: string | null;
  readonly appVersion: string | null;
  readonly expiresAt: string;
};

/** O que a página de confirmação mostra ao usuário sobre o aparelho. */
export async function findPending(code: string, now: Date = new Date()): Promise<PendingPairing | null> {
  const database = getDatabase();
  const [linha] = await database
    .select()
    .from(pairingRequests)
    .where(
      and(
        eq(pairingRequests.code, code.toUpperCase()),
        isNull(pairingRequests.approvedByUserId),
        gt(pairingRequests.expiresAt, now.toISOString()),
      ),
    )
    .limit(1);

  return linha
    ? {
        code: linha.code,
        deviceName: linha.deviceName,
        platform: linha.platform,
        appVersion: linha.appVersion,
        expiresAt: linha.expiresAt,
      }
    : null;
}

/**
 * O usuário confirma no navegador.
 *
 * A partir daqui o pedido fica com dono, e o próximo resgate emite o token.
 */
export async function approve(userId: string, code: string, now: Date = new Date()): Promise<void> {
  const pendente = await findPending(code, now);
  if (!pendente) throw notFound("Código de pareamento");

  await getDatabase()
    .update(pairingRequests)
    .set({ approvedByUserId: userId, approvedAt: now.toISOString() })
    .where(eq(pairingRequests.code, code.toUpperCase()));
}

export type PairingClaim = {
  readonly status: "pendente" | "aprovado" | "expirado";
  readonly token?: string;
  readonly expiresAt?: string;
  readonly user?: { id: string; displayName: string; email: string };
};

/**
 * O aplicativo pergunta se já foi aprovado.
 *
 * Quando foi, o pedido é consumido e o token sai **uma única vez**: um pedido
 * que continuasse resgatável viraria uma chave permanente escondida no banco.
 */
export async function claim(
  code: string,
  pollToken: string,
  now: Date = new Date(),
): Promise<PairingClaim> {
  const database = getDatabase();
  const [linha] = await database
    .select()
    .from(pairingRequests)
    .where(eq(pairingRequests.code, code.toUpperCase()))
    .limit(1);

  if (!linha) throw notFound("Código de pareamento");

  if (linha.pollToken !== pollToken) {
    // Quem viu o código na tela não pode resgatar em nome do aparelho.
    await database
      .update(pairingRequests)
      .set({ attempts: linha.attempts + 1 })
      .where(eq(pairingRequests.code, linha.code));

    if (linha.attempts + 1 >= MAX_ATTEMPTS) {
      await database.delete(pairingRequests).where(eq(pairingRequests.code, linha.code));
    }
    throw conflict("Este código não pertence a este aparelho");
  }

  if (linha.attempts >= MAX_ATTEMPTS) {
    throw rateLimited("Muitas tentativas neste código. Peça um novo no aplicativo.");
  }

  if (linha.expiresAt <= now.toISOString()) {
    await database.delete(pairingRequests).where(eq(pairingRequests.code, linha.code));
    return { status: "expirado" };
  }

  if (!linha.approvedByUserId) return { status: "pendente" };

  const sessao = await issueSession({
    userId: linha.approvedByUserId,
    kind: "device",
    deviceId: linha.deviceId,
    deviceName: linha.deviceName,
    platform: linha.platform,
    appVersion: linha.appVersion,
    now,
  });

  // Consome o pedido: o token sai uma vez só.
  await database.delete(pairingRequests).where(eq(pairingRequests.code, linha.code));

  const { users } = await import("../db/schema/index.ts");
  const [dono] = await database
    .select({ id: users.id, displayName: users.displayName, email: users.email })
    .from(users)
    .where(eq(users.id, linha.approvedByUserId))
    .limit(1);

  return {
    status: "aprovado",
    token: sessao.token,
    expiresAt: sessao.expiresAt,
    user: dono,
  };
}

/** Remove pedidos vencidos. Chamado junto do início de um novo pareamento. */
export async function purgeExpired(now: Date = new Date()): Promise<void> {
  const { lt } = await import("drizzle-orm");
  await getDatabase().delete(pairingRequests).where(lt(pairingRequests.expiresAt, now.toISOString()));
}
