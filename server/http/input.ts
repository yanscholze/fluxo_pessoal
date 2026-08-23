/**
 * Leitura de entrada.
 *
 * Nada que venha de fora chega ao serviço sem passar por aqui. O leitor
 * **acumula** os problemas em vez de estourar no primeiro: o usuário recebe
 * todos os campos errados de uma vez, não um por requisição.
 */

import { type FieldIssue, validationError } from "../../core/kernel/errors.ts";
import { parseId } from "../../core/kernel/id.ts";
import { type Cents, cents, parseMoney } from "../../core/kernel/money.ts";
import { type Competence, parseCompetence } from "../../core/time/competence.ts";
import { type LocalDate, parseLocalDate } from "../../core/time/local-date.ts";

export class InputReader {
  private readonly issues: FieldIssue[] = [];

  constructor(private readonly body: Record<string, unknown>) {}

  private fail(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  private raw(path: string): unknown {
    return this.body[path];
  }

  private missing(path: string): boolean {
    const value = this.raw(path);
    return value === undefined || value === null || value === "";
  }

  string(path: string, options: { max?: number; min?: number } = {}): string {
    const value = this.raw(path);
    if (typeof value !== "string" || !value.trim()) {
      this.fail(path, "Campo obrigatório");
      return "";
    }
    const trimmed = value.trim();
    if (options.min && trimmed.length < options.min) {
      this.fail(path, `Use ao menos ${options.min} caracteres`);
    }
    if (options.max && trimmed.length > options.max) {
      this.fail(path, `Use no máximo ${options.max} caracteres`);
      return trimmed.slice(0, options.max);
    }
    return trimmed;
  }

  optionalString(path: string, options: { max?: number } = {}): string | null {
    if (this.missing(path)) return null;
    return this.string(path, options);
  }

  /**
   * Dinheiro.
   *
   * Aceita centavo inteiro (o que o app manda), decimal em reais e texto
   * digitado em pt-BR. A conversão acontece uma vez, aqui — daqui pra dentro
   * é sempre `Cents`.
   */
  money(path: string, options: { allowZero?: boolean; allowNegative?: boolean } = {}): Cents {
    const value = this.raw(path);
    let parsed: Cents | null = null;

    if (typeof value === "number" && Number.isFinite(value)) {
      parsed = Number.isInteger(value) ? cents(value) : cents(Math.round(value * 100));
    } else if (typeof value === "string") {
      parsed = parseMoney(value);
    }

    if (parsed === null) {
      this.fail(path, "Informe um valor válido");
      return cents(0);
    }
    if (!options.allowNegative && parsed < 0) {
      this.fail(path, "O valor não pode ser negativo");
    }
    if (!options.allowZero && parsed === 0) {
      this.fail(path, "Informe um valor maior que zero");
    }
    return parsed;
  }

  optionalMoney(path: string, options: { allowNegative?: boolean } = {}): Cents | null {
    if (this.missing(path)) return null;
    return this.money(path, { ...options, allowZero: true });
  }

  date(path: string): LocalDate {
    const parsed = parseLocalDate(this.raw(path));
    if (!parsed) {
      this.fail(path, "Informe uma data no formato AAAA-MM-DD");
      return "1970-01-01" as LocalDate;
    }
    return parsed;
  }

  optionalDate(path: string): LocalDate | null {
    if (this.missing(path)) return null;
    return this.date(path);
  }

  competence(path: string): Competence {
    const parsed = parseCompetence(this.raw(path));
    if (!parsed) {
      this.fail(path, "Informe uma competência no formato AAAA-MM");
      return "1970-01" as Competence;
    }
    return parsed;
  }

  optionalCompetence(path: string): Competence | null {
    if (this.missing(path)) return null;
    return this.competence(path);
  }

  integer(path: string, options: { min?: number; max?: number } = {}): number {
    const value = this.raw(path);
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isInteger(parsed)) {
      this.fail(path, "Informe um número inteiro");
      return options.min ?? 0;
    }
    if (options.min !== undefined && parsed < options.min) {
      this.fail(path, `O mínimo é ${options.min}`);
    }
    if (options.max !== undefined && parsed > options.max) {
      this.fail(path, `O máximo é ${options.max}`);
    }
    return parsed;
  }

  optionalInteger(path: string, options: { min?: number; max?: number } = {}): number | null {
    if (this.missing(path)) return null;
    return this.integer(path, options);
  }

  boolean(path: string, fallback = false): boolean {
    const value = this.raw(path);
    if (value === undefined || value === null) return fallback;
    if (typeof value === "boolean") return value;
    if (value === "true" || value === 1) return true;
    if (value === "false" || value === 0) return false;
    this.fail(path, "Informe verdadeiro ou falso");
    return fallback;
  }

  choice<const T extends readonly string[]>(path: string, allowed: T): T[number] {
    const value = this.raw(path);
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) {
      return value as T[number];
    }
    this.fail(path, `Valor inválido. Use um de: ${allowed.join(", ")}`);
    return allowed[0];
  }

  optionalChoice<const T extends readonly string[]>(path: string, allowed: T): T[number] | null {
    if (this.missing(path)) return null;
    return this.choice(path, allowed);
  }

  /** Identificador gerado pelo cliente. Recusa string arbitrária. */
  id(path: string): string {
    const parsed = parseId(this.raw(path));
    if (!parsed) {
      this.fail(path, "Identificador inválido");
      return "";
    }
    return parsed;
  }

  optionalId(path: string): string | null {
    if (this.missing(path)) return null;
    return this.id(path);
  }

  /** Referência a outra entidade. Aceita qualquer texto não vazio. */
  reference(path: string): string {
    return this.string(path, { max: 64 });
  }

  optionalReference(path: string): string | null {
    if (this.missing(path)) return null;
    return this.reference(path);
  }

  /** Registra um problema descoberto pelo serviço, não pelo formato. */
  reject(path: string, message: string): void {
    this.fail(path, message);
  }

  get hasIssues(): boolean {
    return this.issues.length > 0;
  }

  /** Estoura com todos os problemas acumulados. Chame antes de usar os valores. */
  done(message = "Revise os campos destacados"): void {
    if (this.issues.length) throw validationError(message, this.issues);
  }
}

export function read(body: Record<string, unknown>): InputReader {
  return new InputReader(body);
}
