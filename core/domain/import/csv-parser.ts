/**
 * Parser de CSV de extrato e fatura.
 *
 * CSV bancário brasileiro não tem padrão: o delimitador é `;` ou `,`, o valor
 * vem em pt-BR (`1.234,56`) ou em US (`1234.56`), a data em quatro formatos, e
 * o cabeçalho às vezes simplesmente não existe. Por isso nada aqui é fixo — o
 * arquivo é inspecionado e o parser se adapta.
 *
 * Este estágio só extrai o que está escrito. Ele **não** decide se a linha é
 * despesa ou receita, nem se é pagamento de fatura ou estorno: esses descartes
 * dependem do destino da importação (conta ou cartão), que o parser não
 * conhece. Aqui só saem os descartes estruturais — linha que não é lançamento
 * ou à qual falta data, descrição ou valor.
 */

import { type Cents, ZERO, abs, parseMoney, subtract } from "../../kernel/money.ts";
import { type LocalDate, parseLocalDate } from "../../time/local-date.ts";
import { MAX_INSTALLMENTS } from "../installment/plan.ts";
import type { DiscardReason, DiscardedRow, ParseResult, ParsedRow } from "./types.ts";

/** Um registro do arquivo: os campos já separados e o texto original da linha. */
type CsvRecord = {
  readonly fields: readonly string[];
  /** Trecho literal do arquivo, preservado para o usuário conferir na revisão. */
  readonly raw: string;
};

type ColumnRole = "date" | "amount" | "installment" | "credit" | "debit" | "description";

/** Índice de cada papel no registro. `-1` quando a coluna não existe. */
type ColumnMap = { readonly [role in ColumnRole]: number };

const EMPTY_COLUMNS: ColumnMap = { date: -1, amount: -1, installment: -1, credit: -1, debit: -1, description: -1 };

/**
 * Palavras-chave por papel, **na ordem em que são testadas**.
 *
 * A ordem decide os empates: "Valor da parcela" tem as duas palavras e precisa
 * virar valor, não parcela. Descrição fica por último porque é a lista mais
 * ampla e engoliria cabeçalhos como "Data do lançamento".
 */
const COLUMN_KEYWORDS: ReadonlyArray<readonly [ColumnRole, readonly string[]]> = [
  ["date", ["data", "date", "dt"]],
  ["amount", ["valor", "amount", "montante", "quantia"]],
  ["installment", ["parcela", "parcelas", "installment"]],
  ["credit", ["entrada", "credito"]],
  ["debit", ["saida", "debito"]],
  ["description", ["descricao", "description", "historico", "titulo", "estabelecimento", "memo", "lancamento"]],
];

export function parseCsv(text: string): ParseResult {
  // O BOM gruda no primeiro cabeçalho ("\uFEFFData") e faria a coluna de data
  // não ser reconhecida por diferença de um caractere invisível.
  const source = text.replace(/^\uFEFF/, "");
  const records = tokenize(source, detectDelimiter(source));

  const rows: ParsedRow[] = [];
  const discarded: DiscardedRow[] = [];

  const headerAt = findHeaderRecord(records);
  const dataStart = headerAt >= 0 ? headerAt + 1 : firstDataRecord(records);
  if (dataStart === -1) {
    for (const record of records) discarded.push({ reason: "nao_e_lancamento", rawText: record.raw });
    return { format: "csv", rows, discarded };
  }

  const header = headerAt >= 0 ? mapHeader(records[headerAt].fields) : EMPTY_COLUMNS;
  const sample = records.slice(dataStart).find((record) => !isBlank(record));
  const columns = resolveColumns(header, headerAt >= 0, sample);

  records.forEach((record, index) => {
    if (index < dataStart) {
      discarded.push({ reason: "nao_e_lancamento", rawText: record.raw });
      return;
    }
    const outcome = readRow(record, columns);
    if ("reason" in outcome) discarded.push({ reason: outcome.reason, rawText: record.raw });
    else rows.push(outcome.row);
  });

  return { format: "csv", rows, discarded };
}

/**
 * Acha o cabeçalho, que nem sempre é a primeira linha.
 *
 * Exportação de banco costuma abrir com título, período e linhas em branco.
 * Parar na primeira linha faria o cabeçalho de verdade cair como dado e o
 * arquivo inteiro sair como `sem_data` — perda silenciosa do extrato todo.
 * A varredura termina na primeira linha com data: dali em diante é dado, e um
 * cabeçalho que aparecesse depois seria coincidência de palavra.
 */
function findHeaderRecord(records: readonly CsvRecord[]): number {
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (isBlank(record)) continue;
    if (hasDate(record)) return -1;
    if (isUsable(mapHeader(record.fields))) return index;
  }
  return -1;
}

/** Sem cabeçalho, a régua das colunas é a primeira linha com data. */
function firstDataRecord(records: readonly CsvRecord[]): number {
  const dated = records.findIndex((record) => hasDate(record));
  return dated >= 0 ? dated : records.findIndex((record) => !isBlank(record));
}

function hasDate(record: CsvRecord): boolean {
  return record.fields.some((field) => parseCsvDate(field) !== null);
}

/**
 * Escolhe o delimitador contando `;` e `,` **fora de aspas** na primeira linha
 * que tenha algum dos dois.
 *
 * Contar dentro de aspas inverteria a decisão em arquivos como
 * `Data;Descrição;Valor` com um `"MERCADO, LTDA"` logo abaixo. Linha sem
 * separador nenhum é preâmbulo e não descreve o formato do arquivo. O empate
 * fica com `;`, que é o que Excel e bancos brasileiros geram.
 */
function detectDelimiter(text: string): string {
  let quoted = false;
  let semicolons = 0;
  let commas = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (char === "\n" || char === "\r") break;
    if (char === ";") semicolons += 1;
    else if (char === ",") commas += 1;
  }

  return commas > semicolons ? "," : ";";
}

/**
 * Separa o texto em registros e campos.
 *
 * Máquina de estados em vez de `split`: um campo entre aspas pode conter o
 * delimitador, aspas escapadas (`""`) e até quebra de linha — um endereço em
 * duas linhas dentro de uma célula é comum em fatura exportada de planilha.
 */
function tokenize(text: string, delimiter: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let recordStart = 0;
  let index = 0;
  let quoted = false;

  const closeRecord = (end: number): void => {
    records.push({ fields: [...fields, field], raw: text.slice(recordStart, end) });
    fields = [];
    field = "";
  };

  while (index < text.length) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      if (char === "\r") {
        // Quebra dentro de aspas vira sempre "\n": o campo é conteúdo, e o
        // consumidor não deve ver o CRLF do arquivo.
        field += "\n";
        index += text[index + 1] === "\n" ? 2 : 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      fields.push(field);
      field = "";
      index += 1;
      continue;
    }
    if (char === "\n" || char === "\r") {
      closeRecord(index);
      index += char === "\r" && text[index + 1] === "\n" ? 2 : 1;
      recordStart = index;
      continue;
    }

    field += char;
    index += 1;
  }

  // Sem este teste, um arquivo terminado em quebra de linha ganharia um
  // registro vazio de brinde no fim.
  if (index > recordStart || field || fields.length) closeRecord(index);
  return records;
}

function isBlank(record: CsvRecord): boolean {
  return record.fields.every((field) => field.trim() === "");
}

/** Acentos e caixa não podem separar "Descrição" de "descricao". */
function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Palavras curtas (`dt`) só casam como token inteiro; as longas casam por
 * conteúdo, para aceitar "Valor (R$)" e "Data da compra".
 */
function headerMatches(header: string, keyword: string): boolean {
  const normalized = normalizeKey(header);
  if (keyword.length >= 4 && normalized.includes(keyword)) return true;
  return normalized.split(/[^a-z0-9]+/).includes(keyword);
}

function mapHeader(fields: readonly string[]): ColumnMap {
  const map: Record<ColumnRole, number> = { ...EMPTY_COLUMNS };

  fields.forEach((field, index) => {
    for (const [role, keywords] of COLUMN_KEYWORDS) {
      if (map[role] !== -1) continue;
      if (keywords.some((keyword) => headerMatches(field, keyword))) {
        map[role] = index;
        return;
      }
    }
  });

  return map;
}

/** Um cabeçalho só serve se der para achar data e algum valor. */
function isUsable(columns: ColumnMap): boolean {
  return columns.date >= 0 && (columns.amount >= 0 || (columns.credit >= 0 && columns.debit >= 0));
}

function resolveColumns(header: ColumnMap, hasHeader: boolean, sample: CsvRecord | undefined): ColumnMap {
  if (!hasHeader) return sample ? inferColumns(sample) : EMPTY_COLUMNS;
  // Cabeçalho reconhecido mas sem coluna de descrição declarada: ainda dá para
  // achá-la olhando os dados, e sem descrição toda linha seria descartada.
  if (header.description >= 0 || !sample) return header;
  return { ...header, description: widestTextColumn(sample, header) };
}

/**
 * Descobre as colunas pela primeira linha de dados, quando não há cabeçalho.
 *
 * O critério é o que a especificação define: a coluna que parseia como data, a
 * que parseia como dinheiro, e a maior coluna de texto que não é nenhuma das
 * duas.
 */
function inferColumns(record: CsvRecord): ColumnMap {
  const fields = record.fields.map((field) => field.trim());
  const date = fields.findIndex((field) => parseCsvDate(field) !== null);
  const amount = fields.findIndex((field, index) => index !== date && parseMoney(field) !== null);
  const installment = fields.findIndex(
    (field, index) => index !== date && index !== amount && FULL_INSTALLMENT.test(field),
  );
  const partial: ColumnMap = { ...EMPTY_COLUMNS, date, amount, installment };
  return { ...partial, description: widestTextColumn(record, partial) };
}

function widestTextColumn(record: CsvRecord, taken: ColumnMap): number {
  let best = -1;
  let bestLength = 0;

  record.fields.forEach((field, index) => {
    if (index === taken.date || index === taken.amount || index === taken.installment) return;
    if (index === taken.credit || index === taken.debit) return;
    const text = field.trim();
    if (!text || parseCsvDate(text) !== null || parseMoney(text) !== null) return;
    if (text.length > bestLength) {
      best = index;
      bestLength = text.length;
    }
  });

  return best;
}

const ISO_LIKE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
const BR_LIKE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/;

/**
 * Aceita `DD/MM/AAAA`, `DD-MM-AAAA`, `AAAA-MM-DD` e `DD/MM/AA`.
 *
 * O ano de dois dígitos vira século 2000 — extrato de banco não guarda 1998, e
 * um lançamento datado de 26 é 2026. A validação final é do `parseLocalDate`,
 * que rejeita 31/02 em vez de deixar virar 03/03 como faria `new Date`.
 */
function parseCsvDate(value: string): LocalDate | null {
  const text = value.trim().split(/[\sT]/)[0];
  if (!text) return null;

  const iso = ISO_LIKE.exec(text);
  if (iso) return buildDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const brazilian = BR_LIKE.exec(text);
  if (!brazilian) return null;
  const year = brazilian[3].length === 2 ? 2000 + Number(brazilian[3]) : Number(brazilian[3]);
  return buildDate(year, Number(brazilian[2]), Number(brazilian[1]));
}

function buildDate(year: number, month: number, day: number): LocalDate | null {
  const pad = (value: number, size: number): string => String(value).padStart(size, "0");
  return parseLocalDate(`${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);
}

type InstallmentMatch = {
  readonly current: number;
  readonly total: number;
  readonly start: number;
  readonly end: number;
};

const INSTALLMENT_MARKER = /(?:parcela\s*)?\b(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\b/gi;
const FULL_INSTALLMENT = /^\s*(?:parcela\s*)?\d{1,2}\s*(?:\/|\s+de\s+)\s*\d{1,2}\s*$/i;

/**
 * Acha `3/10` ou `parcela 3 de 10` no texto.
 *
 * Percorre todas as ocorrências em vez de parar na primeira: em
 * "COMPRA 13/08 PARCELA 2 DE 3" a primeira parece parcela mas é data, e só a
 * validação (atual ≤ total ≤ teto do produto) separa uma da outra.
 */
function findInstallment(text: string): InstallmentMatch | null {
  for (const match of text.matchAll(INSTALLMENT_MARKER)) {
    const current = Number(match[1]);
    const total = Number(match[2]);
    // `total < 2` não é parcelamento: "1/1" é à vista, e tratá-lo como plano
    // criaria um parcelamento de uma parcela só na tela de acompanhamento.
    if (current < 1 || total < 2 || current > total || total > MAX_INSTALLMENTS) continue;
    const start = match.index ?? 0;
    return { current, total, start, end: start + match[0].length };
  }
  return null;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Tira o marcador de parcela e o separador que sobrava colado nele. */
function stripMarker(text: string, marker: InstallmentMatch): string {
  const before = text.slice(0, marker.start).replace(/[\s\-–—|:·]+$/, "");
  const after = text.slice(marker.end).replace(/^[\s\-–—|:·]+/, "");
  return collapse(`${before} ${after}`);
}

type RowOutcome = { readonly row: ParsedRow } | { readonly reason: DiscardReason };

function readRow(record: CsvRecord, columns: ColumnMap): RowOutcome {
  if (isBlank(record)) return { reason: "nao_e_lancamento" };

  const cell = (index: number): string => (index >= 0 ? (record.fields[index] ?? "").trim() : "");

  const date = parseCsvDate(cell(columns.date));
  if (!date) return { reason: "sem_data" };

  const rawDescription = cell(columns.description);
  const inDescription = findInstallment(rawDescription);
  // Descrição que era só o marcador ficaria vazia; nesse caso o marcador é a
  // única identificação que a linha tem, então ele volta.
  const description = inDescription
    ? stripMarker(rawDescription, inDescription) || collapse(rawDescription)
    : collapse(rawDescription);
  if (!description) return { reason: "sem_descricao" };

  const amount = readAmount(cell(columns.amount), cell(columns.credit), cell(columns.debit));
  if (amount === null) return { reason: "sem_valor" };

  const declared = findInstallment(cell(columns.installment)) ?? inDescription;

  return {
    row: {
      // CSV não traz identidade estável: não há campo que o emissor garanta
      // igual entre duas exportações do mesmo período.
      externalId: null,
      date,
      description,
      amount,
      rawText: record.raw,
      installment: declared ? { current: declared.current, total: declared.total } : null,
    },
  };
}

/**
 * Lê o valor com sinal.
 *
 * Quando o arquivo separa entrada e saída em duas colunas, o sinal está na
 * coluna, não no número: a saída costuma vir positiva e precisa ser negada,
 * senão uma despesa entraria como receita.
 */
function readAmount(amountCell: string, creditCell: string, debitCell: string): Cents | null {
  const direct = money(amountCell);
  if (direct !== null) return direct;

  const credit = money(creditCell);
  const debit = money(debitCell);
  if (credit === null && debit === null) return null;
  return subtract(credit ?? ZERO, abs(debit ?? ZERO));
}

/**
 * Interpreta dinheiro sem deixar uma célula estragada derrubar o arquivo.
 *
 * `parseMoney` lança quando o valor não cabe na faixa representável. Um extrato
 * com uma linha corrompida levaria junto as outras trezentas — o descarte
 * precisa ser da linha, não do arquivo.
 */
function money(cell: string): Cents | null {
  try {
    return parseMoney(cell);
  } catch {
    return null;
  }
}
