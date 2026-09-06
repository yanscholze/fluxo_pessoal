/**
 * Senhas.
 *
 * PBKDF2-SHA256 com sal por usuário. O número de iterações fica gravado junto
 * com o hash: aumentá-lo no futuro não invalida as senhas já cadastradas, e a
 * conta é reforçada silenciosamente no próximo login bem-sucedido.
 */

import { validationError } from "../../core/kernel/errors.ts";

/**
 * Teto do runtime, não escolha nossa.
 *
 * O OWASP recomenda 210 mil iterações para PBKDF2-SHA256, e era esse o valor
 * aqui — mas o Workers recusa acima de cem mil: `Pbkdf2 failed: iteration
 * counts above 100000 are not supported`. Local passava, produção respondia
 * 500 em todo cadastro e todo login, e o erro só aparecia no log do worker.
 *
 * O número fica gravado por usuário junto com o hash, então este valor é só o
 * padrão para senha nova: subir de novo, no dia em que a plataforma permitir,
 * não invalida nenhuma senha já cadastrada — `needsRehash` reforça cada uma no
 * login seguinte.
 */
export const DEFAULT_ITERATIONS = 100_000;

/** O que o runtime aceita. Passar disto é erro de execução, não de senha. */
export const MAX_ITERATIONS = 100_000;

const KEY_BITS = 256;
const SALT_BYTES = 16;

export const MIN_PASSWORD_LENGTH = 10;

const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function assertAcceptablePassword(password: string): void {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw validationError(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres`, [
      { path: "password", message: `Use ao menos ${MIN_PASSWORD_LENGTH} caracteres` },
    ]);
  }
  if (password.length > 512) {
    throw validationError("Senha longa demais", [{ path: "password", message: "Use no máximo 512 caracteres" }]);
  }
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export type PasswordRecord = {
  readonly hash: string;
  readonly salt: string;
  readonly iterations: number;
};

export async function hashPassword(
  password: string,
  iterations = DEFAULT_ITERATIONS,
): Promise<PasswordRecord> {
  assertAcceptablePassword(password);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, salt, iterations);
  return { hash: toBase64(derived), salt: toBase64(salt), iterations };
}

/**
 * Compara em tempo constante.
 *
 * Uma comparação `===` vaza, pelo tempo de resposta, quantos bytes iniciais
 * bateram — o suficiente para reconstruir o hash byte a byte.
 */
function equalsConstantTime(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function verifyPassword(password: string, record: PasswordRecord): Promise<boolean> {
  try {
    const salt = fromBase64(record.salt);
    const expected = fromBase64(record.hash);
    const derived = await derive(password, salt, record.iterations);
    return equalsConstantTime(derived, expected);
  } catch {
    return false;
  }
}

/** Verdadeiro quando vale regravar o hash com o custo atual. */
export function needsRehash(record: PasswordRecord): boolean {
  return record.iterations < DEFAULT_ITERATIONS;
}
