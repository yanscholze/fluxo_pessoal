/**
 * Parser de OFX.
 *
 * OFX é SGML, não XML: as tags de folha vêm sem fechamento (`<TRNAMT>-12.34`
 * acaba na quebra de linha ou na próxima tag), o arquivo inteiro pode vir numa
 * linha só, e os bancos brasileiros ainda escapam acento como entidade HTML.
 * Um parser de XML rejeita esses arquivos — por isso aqui é fatiamento de
 * texto, não árvore.
 *
 * Este estágio não decide nada de negócio: devolve a linha como o arquivo
 * trouxe, com sinal, e só descarta o que não é lançamento nenhum. Classificar
 * entrada/saída, categoria e duplicidade é trabalho dos estágios seguintes.
 */

import { type Cents, isNegative, isZero, negate, parseMoney } from "../../kernel/money.ts";
import { type LocalDate, parseLocalDate } from "../../time/local-date.ts";
import { MAX_INSTALLMENTS } from "../installment/plan.ts";
import type { DiscardReason, DiscardedRow, ParseResult, ParsedRow } from "./types.ts";

/** Quanto do bloco original guardamos para o usuário conferir na revisão. */
const RAW_TEXT_LIMIT = 500;

export function parseOfx(text: string): ParseResult {
  const rows: ParsedRow[] = [];
  const discarded: DiscardedRow[] = [];

  for (const block of sliceBlocks(text)) {
    const rawText = clampRawText(block.raw);
    const outcome = readBlock(block.content);
    if (typeof outcome === "string") discarded.push({ reason: outcome, rawText });
    else rows.push({ ...outcome, rawText });
  }

  return { format: "ofx", rows, discarded };
}

/**
 * Lê um bloco de transação.
 *
 * Devolve o motivo do descarte (string) ou a linha extraída. A ordem das
 * checagens é a do que falta primeiro: sem data, valor ou descrição o bloco não
 * é lançamento; só depois faz sentido perguntar *que* lançamento é.
 */
function readBlock(content: string): DiscardReason | Omit<ParsedRow, "rawText"> {
  const rawDate = field(content, "DTPOSTED");
  const date = rawDate === null ? null : parseOfxDate(rawDate);
  if (date === null) return "sem_data";

  const rawAmount = field(content, "TRNAMT");
  const signedAmount = rawAmount === null ? null : parseOfxAmount(rawAmount);
  // Zero também entra como "sem valor": não move saldo, não vira lançamento e
  // só faria volume na tela de revisão.
  if (signedAmount === null || isZero(signedAmount)) return "sem_valor";

  const description = joinDescription(field(content, "NAME"), field(content, "MEMO"));
  if (description === null) return "sem_descricao";
  if (INVOICE_PAYMENT.test(flatten(description))) return "pagamento_de_fatura";

  const marker = extractInstallment(description);

  return {
    externalId: field(content, "FITID"),
    date,
    // Se a limpeza esvaziou a descrição (o texto era só o marcador), fica a
    // original: perder o lançamento por causa de cosmética seria pior.
    description: marker === null || marker.cleaned === "" ? description : marker.cleaned,
    amount: applySignFromType(signedAmount, field(content, "TRNTYPE"), rawAmount),
    installment: marker === null ? null : marker.installment,
  };
}

// --- fatiamento --------------------------------------------------------------

type BlockSlice = { readonly raw: string; readonly content: string };

const BLOCK_OPENING = /<(STMTTRN|CCSTMTTRN)>/gi;

/**
 * Recorta os blocos de transação do arquivo.
 *
 * O fechamento `</STMTTRN>` é opcional em SGML e há exportador que o omite. Por
 * isso o bloco termina no que vier primeiro: o fechamento, a abertura do
 * próximo bloco, ou o fim do arquivo. Assim um único bloco sem fechamento não
 * engole todas as transações seguintes.
 */
function sliceBlocks(text: string): BlockSlice[] {
  const openings: Array<{ start: number; contentStart: number; tag: string }> = [];
  BLOCK_OPENING.lastIndex = 0;
  for (let match = BLOCK_OPENING.exec(text); match !== null; match = BLOCK_OPENING.exec(text)) {
    openings.push({ start: match.index, contentStart: match.index + match[0].length, tag: match[1].toUpperCase() });
  }

  return openings.map((opening, index) => {
    const limit = index + 1 < openings.length ? openings[index + 1].start : text.length;
    const region = text.slice(opening.contentStart, limit);
    const closing = new RegExp(`</${opening.tag}\\s*>`, "i").exec(region);
    const end = closing === null ? region.length : closing.index + closing[0].length;
    return { raw: text.slice(opening.start, opening.contentStart + end), content: region.slice(0, end) };
  });
}

function clampRawText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= RAW_TEXT_LIMIT ? trimmed : trimmed.slice(0, RAW_TEXT_LIMIT);
}

// --- campos ------------------------------------------------------------------

const FIELD_PATTERNS = {
  DTPOSTED: /<DTPOSTED>([^<\r\n]*)/i,
  TRNAMT: /<TRNAMT>([^<\r\n]*)/i,
  FITID: /<FITID>([^<\r\n]*)/i,
  NAME: /<NAME>([^<\r\n]*)/i,
  MEMO: /<MEMO>([^<\r\n]*)/i,
  TRNTYPE: /<TRNTYPE>([^<\r\n]*)/i,
} as const;

/** Valor de uma tag de folha: vai até a próxima tag ou o fim da linha. */
function field(content: string, tag: keyof typeof FIELD_PATTERNS): string | null {
  const match = FIELD_PATTERNS[tag].exec(content);
  if (match === null) return null;
  const value = decodeEntities(match[1]).trim();
  return value === "" ? null : value;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi;

/**
 * Decodifica entidades HTML numa passada só.
 *
 * Uma passada é o que garante `&amp;lt;` virando o texto `&lt;` e não `<`:
 * decodificar `&amp;` em separado reintroduziria a entidade e ela seria lida de
 * novo na passada seguinte.
 */
function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole: string, body: string) => {
    if (!body.startsWith("#")) return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    const hex = body[1] === "x" || body[1] === "X";
    const codePoint = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
    // Fora da faixa Unicode `fromCodePoint` lança. Devolver o texto cru é melhor
    // do que derrubar a importação inteira por causa de um byte estranho.
    if (!Number.isInteger(codePoint) || codePoint < 1 || codePoint > 0x10ffff) return whole;
    return String.fromCodePoint(codePoint);
  });
}

// --- data --------------------------------------------------------------------

const OFX_DATE = /^(\d{4})(\d{2})(\d{2})/;

/**
 * Lê `AAAAMMDD`, ignorando hora e fuso colados (`20260813120000[-3:BRT]`).
 *
 * Ignorar é a decisão certa, não preguiça: a data de um lançamento é fato de
 * calendário. Converter o instante para outro fuso jogaria a compra da meia-
 * noite para o dia anterior e, com ela, para a competência errada.
 */
function parseOfxDate(raw: string): LocalDate | null {
  const match = OFX_DATE.exec(raw.trim());
  if (match === null) return null;
  return parseLocalDate(`${match[1]}-${match[2]}-${match[3]}`);
}

// --- valor -------------------------------------------------------------------

const OFX_AMOUNT = /^([+-]?)(\d*)(?:[.,](\d+))?$/;

/**
 * Converte `TRNAMT` em centavos, preservando o sinal do arquivo.
 *
 * O separador do OFX é sempre decimal, mas `parseMoney` precisa adivinhar isso
 * sozinho e leria "1.500" como mil e quinhentos. Preenchendo a fração até
 * quatro casas a ambiguidade some (milhar só agrupa de três em três) e o
 * arredondamento continua sendo o do kernel.
 */
function parseOfxAmount(raw: string): Cents | null {
  const match = OFX_AMOUNT.exec(raw.replace(/\s/g, ""));
  if (match === null) return null;
  const [, sign, whole, fraction] = match;
  if (whole === "" && fraction === undefined) return null;
  const body = fraction === undefined ? whole : `${whole}.${fraction.padEnd(4, "0")}`;
  return parseMoney(`${sign}${body}`);
}

/** Tipos em que o dinheiro sai, sem ambiguidade de contexto. */
const DEBIT_TYPES = new Set(["DEBIT", "FEE", "SRVCHG", "ATM", "POS", "CHECK", "DIRECTDEBIT", "CASH"]);

/**
 * Usa `TRNTYPE` só para resgatar o sinal quando o arquivo não o declarou.
 *
 * Exportador conforme já manda `-12,34` na saída. Alguns emitem o valor sem
 * sinal e deixam o tipo carregar a direção — sem isto uma tarifa entraria como
 * receita. `PAYMENT` e `XFER` ficam de fora de propósito: num cartão o
 * pagamento entra como crédito, numa conta sai como débito, e o parser não sabe
 * para onde o arquivo está sendo importado.
 */
function applySignFromType(amount: Cents, type: string | null, rawAmount: string): Cents {
  if (type === null || isNegative(amount) || /^\s*[+-]/.test(rawAmount)) return amount;
  return DEBIT_TYPES.has(type.toUpperCase()) ? negate(amount) : amount;
}

// --- descrição ---------------------------------------------------------------

/**
 * Junta `NAME` e `MEMO` sem repetir.
 *
 * Metade dos bancos repete o estabelecimento nos dois campos, ou põe em `MEMO`
 * o `NAME` acrescido de detalhe. Comparar sem acento e sem caixa evita
 * "Mercado São João - MERCADO SAO JOAO" na tela.
 */
function joinDescription(name: string | null, memo: string | null): string | null {
  if (name === null) return memo;
  if (memo === null) return name;
  const flatName = flatten(name);
  const flatMemo = flatten(memo);
  // `NAME` primeiro: quando os dois dizem a mesma coisa, o do estabelecimento
  // costuma ser o que vem acentuado e legível.
  if (flatName.includes(flatMemo)) return name;
  if (flatMemo.includes(flatName)) return memo;
  return `${name} - ${memo}`;
}

/** Minúsculas, sem acento e com espaços normalizados — para comparar, não exibir. */
function flatten(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pagamento de fatura que aparece dentro do extrato do cartão.
 *
 * Importá-lo abateria a dívida duas vezes: uma como crédito na fatura, outra
 * como a despesa já lançada do lado da conta que pagou.
 */
const INVOICE_PAYMENT = /pagamento recebido|de fatura|pagamento efetuado|credito de pagamento/i;

// --- parcelas ----------------------------------------------------------------

/**
 * Formatos de parcela, do mais específico para o mais genérico.
 *
 * O genérico (`3/10`) vem por último porque casa também com data (`13/08`); a
 * validação derruba esses casos, e tentar antes os que trazem a palavra
 * "parcela" evita depender só dela.
 */
const INSTALLMENT_PATTERNS: readonly RegExp[] = [
  /\bparc(?:ela)?s?\.?\s*(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\b/gi,
  /\b(\d{1,2})\s*(?:\/|\s+de\s+)\s*(\d{1,2})\b/gi,
];

type Installment = { readonly current: number; readonly total: number };

/**
 * Acha a parcela na descrição e devolve a descrição sem o marcador.
 *
 * Varre todas as ocorrências de cada formato porque a primeira pode ser uma
 * data ("COMPRA 13/08 PARC 3/10"): descartar o padrão inteiro no primeiro
 * palpite inválido perderia a parcela verdadeira logo adiante.
 */
function extractInstallment(description: string): { installment: Installment; cleaned: string } | null {
  for (const pattern of INSTALLMENT_PATTERNS) {
    for (const match of description.matchAll(pattern)) {
      const current = Number(match[1]);
      const total = Number(match[2]);
      if (!isPlausibleInstallment(current, total)) continue;
      const start = match.index ?? 0;
      const rest = `${description.slice(0, start)} ${description.slice(start + match[0].length)}`;
      return { installment: { current, total }, cleaned: tidy(rest) };
    }
  }
  return null;
}

/** `1/1` não é parcelamento e `3/2` é ruído: só passa o que descreve um plano real. */
function isPlausibleInstallment(current: number, total: number): boolean {
  return current >= 1 && total >= 2 && total <= MAX_INSTALLMENTS && current <= total;
}

/** Fecha o buraco deixado pelo marcador: espaços dobrados e separador órfão. */
function tidy(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—·|,]+/, "")
    .replace(/[\s\-–—·|,]+$/, "")
    .trim();
}
