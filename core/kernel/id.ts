/**
 * Identificadores.
 *
 * ULID: 48 bits de tempo em milissegundos + 80 bits de aleatoriedade, em
 * Crockford base32. Ordenável por criação (bom para índice e paginação),
 * único sem coordenação (o Android gera offline) e **sem semântica embutida**.
 *
 * A versão anterior codificava regra de negócio no identificador —
 * `invoice-payment:<id>`, `${grupo}-${índice}`, `recurring-salary` — e o
 * sistema fazia `startsWith` e expressão regular em id para decidir
 * comportamento. Aqui um id é opaco: quem quer saber o que a linha é, lê a
 * coluna que diz.
 */

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: sem I, L, O, U
const ENCODING_LENGTH = ENCODING.length;
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;

/** `2^48 - 1` em milissegundos: cobre até o ano 10889. */
const MAX_TIME = 281_474_976_710_655;

export class IdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdError";
  }
}

function encodeTime(milliseconds: number): string {
  if (!Number.isInteger(milliseconds) || milliseconds < 0 || milliseconds > MAX_TIME) {
    throw new IdError(`Instante fora da faixa do ULID: ${milliseconds}`);
  }
  let remaining = milliseconds;
  let output = "";
  for (let index = TIME_LENGTH - 1; index >= 0; index -= 1) {
    const modulo = remaining % ENCODING_LENGTH;
    output = ENCODING[modulo] + output;
    remaining = (remaining - modulo) / ENCODING_LENGTH;
  }
  return output;
}

function randomBytes(length: number): Uint8Array {
  const buffer = new Uint8Array(length);
  // `crypto` existe no Worker, no Node 22 e no Hermes com polyfill do Expo.
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues !== "function") {
    throw new IdError("Gerador de aleatoriedade indisponível neste ambiente");
  }
  crypto.getRandomValues(buffer);
  return buffer;
}

function encodeRandom(length: number): string {
  const bytes = randomBytes(length);
  let output = "";
  for (let index = 0; index < length; index += 1) {
    // Descarta o viés desprezível de 256 % 32 === 0 — a divisão é exata.
    output += ENCODING[bytes[index] % ENCODING_LENGTH];
  }
  return output;
}

/**
 * Gera um ULID.
 *
 * Recebe o instante como parâmetro para permitir teste determinístico; em
 * produção usa o relógio.
 */
export function newId(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom(RANDOM_LENGTH);
}

const ULID_PATTERN = new RegExp(`^[${ENCODING}]{${TIME_LENGTH + RANDOM_LENGTH}}$`);

export function isId(value: unknown): value is string {
  return typeof value === "string" && ULID_PATTERN.test(value);
}

/**
 * Aceita um identificador vindo de fora.
 *
 * O Android gera identificadores offline, então o servidor precisa recebê-los.
 * O que ele não aceita é qualquer string: um id malformado vira erro na borda,
 * não uma linha órfã no banco.
 */
export function parseId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return isId(normalized) ? normalized : null;
}

/** Instante de criação embutido no ULID, em milissegundos. */
export function timestampOf(id: string): number {
  if (!isId(id)) throw new IdError(`Identificador inválido: ${id}`);
  let total = 0;
  for (const character of id.slice(0, TIME_LENGTH)) {
    total = total * ENCODING_LENGTH + ENCODING.indexOf(character);
  }
  return total;
}
