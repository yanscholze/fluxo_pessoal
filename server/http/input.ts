/**
 * Leitura de entrada.
 *
 * Nada que venha de fora chega ao serviço sem passar por aqui. O leitor
 * **acumula** os problemas em vez de estourar no primeiro: o usuário recebe
 * todos os campos errados de uma vez, não um por requisição.
 */

import { type FieldIssue, validationError } from "../../core/kernel/errors.ts";
import { parseId } from "../../core/kernel/id.ts";
import { type Cents, cents, parseMoney, parseScaled } from "../../core/kernel/money.ts";
import { type Competence, parseCompetence } from "../../core/time/competence.ts";
import { type LocalDate, parseLocalDate } from "../../core/time/local-date.ts";

export class InputReader {
  private readonly issues: FieldIssue[] = [];
  /*
   * Campo declarado e atribuído, e não `constructor(private readonly body)`.
   * A forma curta é açúcar do TypeScript, e o executor de teste do Node roda
   * em modo que só remove tipos: com ela, este módulo era o único do servidor
   * que não podia ser testado.
   */
  private readonly body: Record<string, unknown>;
  /** Campos que alguma leitura tocou. O resto o `done()` denuncia. */
  private readonly lidos = new Set<string>();

  constructor(body: Record<string, unknown>) {
    this.body = body;
  }

  private fail(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  private raw(path: string): unknown {
    this.lidos.add(path);
    return this.body[path];
  }

  private missing(path: string): boolean {
    const value = this.raw(path);
    return value === undefined || value === null || value === "";
  }

  /**
   * A chave veio no corpo, mesmo que vazia.
   *
   * `missing` trata `""` como ausente, o que é o certo para quem só quer ler
   * um valor. Numa edição parcial a diferença importa: campo ausente é "não
   * mexe", campo enviado vazio é "apague". Sem isto, remover um link que mudou
   * seria impossível pela API.
   */
  provided(path: string): boolean {
    // Registra a leitura: perguntar se a chave veio **é** lê-la. Sem isto, uma
    // rota que só consulta `provided` para um campo teria esse campo recusado
    // por `done()` como não reconhecido.
    this.lidos.add(path);
    return Object.hasOwn(this.body, path);
  }

  /**
   * Uma lista, ainda crua.
   *
   * O leitor valida campo a campo, e um item de lista não é um campo do corpo.
   * Forçá-lo a isso esconderia **qual** item está errado, que é justamente o
   * que quem importa dezenas de parcelas precisa saber — então a rota valida os
   * itens à mão e diz o índice.
   *
   * O que este método garante é o contorno: que veio lista, que o tamanho cabe,
   * e — o motivo de ele existir — que o campo entra em `lidos`. Ler
   * `body.parcels` direto, como a rota de parcelamento fazia, deixa a chave
   * invisível para o leitor: `done()` a denuncia como "campo não reconhecido" e
   * a rota devolve 400 em **toda** chamada, inclusive nas corretas.
   */
  list(path: string, options: { min?: number; max?: number } = {}): unknown[] {
    const value = this.raw(path);
    if (!Array.isArray(value)) {
      this.fail(path, "Envie uma lista");
      return [];
    }
    const min = options.min ?? 0;
    const max = options.max ?? Number.MAX_SAFE_INTEGER;
    if (value.length < min) this.fail(path, `Envie ao menos ${min} ${min === 1 ? "item" : "itens"}`);
    if (value.length > max) this.fail(path, `Envie no máximo ${max} itens`);
    return value;
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

  /**
   * Número decimal lido na unidade mínima inteira que o domínio guarda.
   *
   * `scale` é quantas casas cabem na unidade — 3 para pontos e horas, que o
   * Fluxo guarda em milésimos. É o mesmo leitor do dinheiro, que já sabe que
   * "2.500,61" e "2500.61" são o mesmo número e que o ponto de "1.500" separa
   * milhar. Pedir `integer` para um saldo que tem casas decimais é o que fazia
   * um resgate legítimo voltar como "informe um número inteiro".
   */
  scaled(
    path: string,
    options: { scale: number; allowZero?: boolean; allowNegative?: boolean },
  ): number {
    const value = this.raw(path);
    let parsed: number | null = null;

    if (typeof value === "number" && Number.isFinite(value)) {
      parsed = Math.round(value * 10 ** options.scale);
    } else if (typeof value === "string") {
      parsed = parseScaled(value, options.scale);
    }

    if (parsed === null) {
      this.fail(path, "Informe um número válido");
      return 0;
    }
    if (!options.allowNegative && parsed < 0) {
      this.fail(path, "O valor não pode ser negativo");
    }
    if (!options.allowZero && parsed === 0) {
      this.fail(path, "Informe um valor maior que zero");
    }
    return parsed;
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

  /**
   * Booleano opcional: `null` quando o campo não veio.
   *
   * Existe porque a alternativa que se usava — `optionalChoice(["true",
   * "false"])` — aceita só a **string**. Um cliente que mande o JSON natural,
   * `{"billable": false}`, levava 400 na rota de correção enquanto a de
   * criação aceitava o mesmo valor: duas regras para o mesmo campo, e a
   * segunda só aparecia depois de já ter escrito o formulário.
   */
  optionalBoolean(path: string): boolean | null {
    const value = this.raw(path);
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "boolean") return value;
    if (value === "true" || value === 1) return true;
    if (value === "false" || value === 0) return false;
    this.fail(path, "Informe verdadeiro ou falso");
    return null;
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

  /**
   * Estoura com todos os problemas acumulados. Chame antes de usar os valores.
   *
   * Campo que a rota não lê também é problema, e o pior tipo: um `PATCH` com
   * `{"color": "#6d4bd8"}` numa rota que só entende `isPrimary` respondia 200
   * sem trocar cor nenhuma. O cliente não tem como descobrir que o campo foi
   * ignorado — ele pediu, recebeu sucesso, e nada mudou.
   */
  done(message?: string): void {
    for (const campo of Object.keys(this.body)) {
      if (!this.lidos.has(campo)) {
        this.fail(campo, "Campo não reconhecido por esta rota");
      }
    }
    if (!this.issues.length) return;

    /*
     * Com um problema só, a mensagem geral **é** esse problema.
     *
     * "Revise os campos destacados" pressupõe uma tela que destaca campos, e
     * várias daqui não destacam: mostram a mensagem geral e mais nada. Quem
     * digitava pontos com vírgula lia "revise os campos destacados" sem saber
     * qual campo nem o quê — a informação existia, em `issues`, e não chegava
     * a ninguém. Com dois ou mais, aí sim vale pedir para revisar, porque
     * nenhuma frase única daria conta.
     */
    const geral =
      message ?? (this.issues.length === 1 ? this.issues[0].message : "Revise os campos destacados");

    throw validationError(geral, this.issues);
  }
}

export function read(body: Record<string, unknown>): InputReader {
  return new InputReader(body);
}
