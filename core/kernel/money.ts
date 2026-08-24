/**
 * Dinheiro em centavos inteiros.
 *
 * Todo valor monetário do Fluxo é um inteiro de centavos. Nunca float:
 * `0.1 + 0.2 !== 0.3` e comparações com epsilon (`> 0.005`) escondem erro de
 * arredondamento em vez de eliminá-lo.
 *
 * `Cents` é um número "marcado" (branded) — o compilador impede somar um
 * centavo a uma quantidade qualquer sem passar por estas funções.
 */

declare const centsBrand: unique symbol;

export type Cents = number & { readonly [centsBrand]: true };

export const ZERO = 0 as Cents;

/** Erro lançado quando um valor monetário não pode ser representado. */
export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/**
 * Maior valor que mantém precisão exata em centavos.
 * `Number.MAX_SAFE_INTEGER` é ~9e15; limitamos a 1 trilhão de reais para que
 * qualquer soma intermediária continue segura.
 */
const MAX_CENTS = 100_000_000_000_000;

function assertSafe(value: number): Cents {
  if (!Number.isFinite(value)) throw new MoneyError(`Valor monetário inválido: ${value}`);
  if (!Number.isInteger(value)) throw new MoneyError(`Valor monetário não inteiro: ${value}`);
  if (Math.abs(value) > MAX_CENTS) throw new MoneyError(`Valor monetário fora de faixa: ${value}`);
  // `-0` é igual a `0` em toda comparação, mas o `Intl` o formata como
  // "-R$ 0,00". Um zero negativo nasce fácil (`multiply(-20, 0.01)`,
  // `negate(0)`, uma parcela zerada) e vaza direto para a tela.
  return (value === 0 ? 0 : value) as Cents;
}

/** Constrói a partir de um inteiro de centavos já conhecido (ex.: vindo do banco). */
export function cents(value: number): Cents {
  return assertSafe(Math.trunc(value));
}

/** Constrói a partir de reais decimais (ex.: `12.34` -> 1234). */
export function fromDecimal(value: number): Cents {
  if (!Number.isFinite(value)) throw new MoneyError(`Valor decimal inválido: ${value}`);
  return assertSafe(Math.round(value * 100));
}

/** Converte para reais decimais. Use apenas na fronteira de exibição. */
export function toDecimal(value: Cents): number {
  return value / 100;
}

/**
 * Interpreta texto digitado por humano em pt-BR ou formato de arquivo bancário.
 *
 * Aceita `1.234,56`, `1234,56`, `1234.56`, `R$ 1.234,56`, `-12,50`, `(12,50)`
 * (parênteses = negativo, comum em extratos) e `1234` (interpretado como reais
 * inteiros). Retorna `null` quando não há número reconhecível — cabe a quem
 * chama decidir se isso é erro de validação ou linha a ignorar.
 */
export function parseMoney(input: string): Cents | null {
  const raw = input.trim();
  if (!raw) return null;

  const parenthesized = /^\((.*)\)$/.exec(raw);
  const body = parenthesized ? parenthesized[1] : raw;

  const cleaned = body.replace(/[R$\s ]/gi, "");
  if (!cleaned) return null;

  const negative = Boolean(parenthesized) || cleaned.startsWith("-");
  const digitsAndSeparators = cleaned.replace(/^[+-]/, "");
  if (!/^[\d.,]+$/.test(digitsAndSeparators)) return null;

  const split = splitDecimal(digitsAndSeparators);
  if (!split) return null;

  const digits = split.integerPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(digits) || !/^\d*$/.test(split.fractionPart)) return null;
  if (!digits && !split.fractionPart) return null;

  // Arredonda a fração em vez de truncar: `0,005` vale meio centavo e precisa
  // virar 1, não sumir.
  const fractionValue = split.fractionPart ? Number(`0.${split.fractionPart}`) : 0;
  if (!Number.isFinite(fractionValue)) return null;
  const total = Number(digits || "0") * 100 + Math.round(fractionValue * 100);
  if (!Number.isFinite(total)) return null;

  return assertSafe(negative ? -total : total);
}

/**
 * Decide qual separador é decimal e qual é milhar.
 *
 * O caso difícil é um separador só, seguido de exatamente três dígitos:
 * `1.500` é mil e quinhentos, mas `0,005` é meio centavo. A regra:
 *
 * - dois tipos de separador presentes: o **último** é o decimal;
 * - o mesmo separador repetido: é milhar (`1.500.000`);
 * - um separador só, cauda de 1 ou 2 dígitos: é decimal;
 * - um separador só, cauda de 3 dígitos: é milhar **se** a parte inteira tiver
 *   de 1 a 3 dígitos e não começar com zero — `0,005` começa com zero, logo é
 *   decimal;
 * - qualquer outra cauda: decimal (milhar sempre agrupa de três em três).
 */
function splitDecimal(value: string): { integerPart: string; fractionPart: string } | null {
  const dots = (value.match(/\./g) ?? []).length;
  const commas = (value.match(/,/g) ?? []).length;

  if (dots === 0 && commas === 0) return { integerPart: value, fractionPart: "" };

  const asThousands = { integerPart: value, fractionPart: "" };

  if (dots > 0 && commas > 0) {
    const splitAt = Math.max(value.lastIndexOf("."), value.lastIndexOf(","));
    return { integerPart: value.slice(0, splitAt), fractionPart: value.slice(splitAt + 1) };
  }

  const separator = dots > 0 ? "." : ",";
  const count = dots > 0 ? dots : commas;
  if (count > 1) return asThousands;

  const splitAt = value.lastIndexOf(separator);
  const head = value.slice(0, splitAt);
  const tail = value.slice(splitAt + 1);

  if (tail.length === 3) {
    const pareceMilhar = head.length >= 1 && head.length <= 3 && !head.startsWith("0");
    return pareceMilhar ? asThousands : { integerPart: head, fractionPart: tail };
  }

  return { integerPart: head, fractionPart: tail };
}

export function add(...values: Cents[]): Cents {
  return assertSafe(values.reduce<number>((total, value) => total + value, 0));
}

export function subtract(minuend: Cents, subtrahend: Cents): Cents {
  return assertSafe(minuend - subtrahend);
}

export function negate(value: Cents): Cents {
  return assertSafe(-value);
}

export function abs(value: Cents): Cents {
  return assertSafe(Math.abs(value));
}

export function sum(values: readonly Cents[]): Cents {
  return assertSafe(values.reduce<number>((total, value) => total + value, 0));
}

export function isZero(value: Cents): boolean {
  return value === 0;
}

export function isNegative(value: Cents): boolean {
  return value < 0;
}

export function isPositive(value: Cents): boolean {
  return value > 0;
}

export function max(left: Cents, right: Cents): Cents {
  return left >= right ? left : right;
}

export function min(left: Cents, right: Cents): Cents {
  return left <= right ? left : right;
}

/** Zera valores negativos — útil para "fatura nunca é menor que zero". */
export function clampToZero(value: Cents): Cents {
  return value > 0 ? value : ZERO;
}

/**
 * Multiplica por um fator (taxa de câmbio, percentual já dividido por 100).
 * Arredonda meio para cima em módulo, para que `-0.5` vire `-1` e `0.5` vire
 * `1` — simétrico, sem viés a favor ou contra o usuário.
 */
export function multiply(value: Cents, factor: number): Cents {
  if (!Number.isFinite(factor)) throw new MoneyError(`Fator inválido: ${factor}`);
  const product = value * factor;
  const rounded = Math.sign(product) * Math.round(Math.abs(product));
  return assertSafe(rounded);
}

/** Aplica um percentual (ex.: `percentOf(10000, 1.5)` = 1,5% de R$100 = 150). */
export function percentOf(value: Cents, percent: number): Cents {
  return multiply(value, percent / 100);
}

/** Divide por um divisor, arredondando. Para dividir em parcelas use `allocate`. */
export function divide(value: Cents, divisor: number): Cents {
  if (!Number.isFinite(divisor) || divisor === 0) throw new MoneyError(`Divisor inválido: ${divisor}`);
  return multiply(value, 1 / divisor);
}

/**
 * Reparte um valor em `parts` fatias sem perder nem inventar centavos.
 *
 * `allocate(100_00, 3)` -> `[3334, 3333, 3333]`. A soma das fatias é sempre
 * exatamente o valor original; o resto é distribuído um centavo por vez a
 * partir da primeira fatia. É assim que um parcelamento de R$1.000,00 em 3x
 * fecha certo — dividir e arredondar cada parcela isoladamente perderia
 * centavos e faria o total das parcelas divergir da compra.
 */
export function allocate(value: Cents, parts: number): Cents[] {
  if (!Number.isInteger(parts) || parts < 1) throw new MoneyError(`Número de partes inválido: ${parts}`);
  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const base = Math.floor(magnitude / parts);
  const remainder = magnitude - base * parts;
  return Array.from({ length: parts }, (_unused, index) =>
    assertSafe(sign * (base + (index < remainder ? 1 : 0))),
  );
}

/**
 * Reparte proporcionalmente a pesos (ex.: ratear uma taxa entre categorias).
 * A soma das fatias é exatamente o valor original; sobras vão para os maiores
 * restos, o que evita viés sistemático contra o mesmo item.
 */
export function allocateByWeights(value: Cents, weights: readonly number[]): Cents[] {
  if (!weights.length) throw new MoneyError("É preciso ao menos um peso para ratear");
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new MoneyError("Pesos devem ser números finitos não negativos");
  }
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  if (totalWeight === 0) return allocate(value, weights.length);

  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const exact = weights.map((weight) => (magnitude * weight) / totalWeight);
  const floors = exact.map((part) => Math.floor(part));
  let remainder = magnitude - floors.reduce((total, part) => total + part, 0);

  const order = exact
    .map((part, index) => ({ index, fraction: part - Math.floor(part) }))
    .sort((left, right) => right.fraction - left.fraction);

  const result = [...floors];
  for (const { index } of order) {
    if (remainder <= 0) break;
    result[index] += 1;
    remainder -= 1;
  }
  return result.map((part) => assertSafe(sign * part));
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string, locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${currency}|${options.maximumFractionDigits ?? 2}|${options.signDisplay ?? "auto"}`;
  const cached = formatterCache.get(key);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency, ...options });
  formatterCache.set(key, formatter);
  return formatter;
}

/** Formata para exibição. `R$ 1.234,56` por padrão. */
export function format(
  value: Cents,
  options: { currency?: string; locale?: string; signDisplay?: Intl.NumberFormatOptions["signDisplay"] } = {},
): string {
  const { currency = "BRL", locale = "pt-BR", signDisplay } = options;
  return formatterFor(currency, locale, signDisplay ? { signDisplay } : {}).format(toDecimal(value));
}

/** Formata sem centavos, para gráficos e resumos: `R$ 1.235`. */
export function formatCompact(value: Cents, options: { currency?: string; locale?: string } = {}): string {
  const { currency = "BRL", locale = "pt-BR" } = options;
  return formatterFor(currency, locale, { maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(
    toDecimal(value),
  );
}
