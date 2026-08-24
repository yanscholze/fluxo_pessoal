/**
 * Identidade e duplicidade de linha importada.
 *
 * O estágio de duplicidade precisa responder uma pergunta só: "esta linha já
 * está no Fluxo?". A resposta vira uma string estável — o *fingerprint* — que
 * é gravada junto do lançamento e comparada nas importações seguintes.
 *
 * Duas armadilhas moldam as regras daqui:
 *
 * 1. **FITID não pode ser escopado por competência.** O `FITID` do OFX já é
 *    único por emissor. Amarrá-lo à fatura em que o arquivo foi importado faz
 *    a mesma transação, reimportada num arquivo de outra competência, nascer
 *    com identidade nova e duplicar.
 * 2. **Parcela vem com centavo dançando.** O emissor distribui o resto do
 *    arredondamento entre as parcelas, e nem sempre da mesma forma entre um
 *    arquivo e outro. A mesma parcela pode voltar com 1 ou 2 centavos de
 *    diferença; sem tolerância, ela entra duas vezes.
 *
 * O fingerprint é composição de texto, não hash: é determinístico, legível no
 * banco quando alguém precisa investigar um falso duplicado, e não exige API
 * assíncrona de criptografia.
 */

import { type Cents, cents } from "../../kernel/money.ts";
import type { ImportTarget, ParsedRow } from "./types.ts";

/**
 * Separador dos campos. Escolhido por não aparecer em data, valor nem em
 * descrição normalizada — a normalização o remove justamente para garantir
 * que nenhuma descrição consiga forjar a identidade de outra linha.
 */
const SEPARATOR = "|";

/** Tolerância de arredondamento entre parcelas, em centavos para cada lado. */
const INSTALLMENT_CENT_TOLERANCE = 5;

/**
 * Escopo do alvo, sem competência.
 *
 * É o escopo da identidade por `FITID`: o emissor garante unicidade dentro da
 * conta ou do cartão, então acrescentar a fatura só criaria identidades novas
 * a cada reimportação do mesmo arquivo.
 */
function targetScope(target: ImportTarget): string {
  return target.kind === "account" ? `account${SEPARATOR}${target.accountId}` : `card${SEPARATOR}${target.cardId}`;
}

/**
 * Escopo da identidade composta, com a competência quando o alvo é cartão.
 *
 * Sem `FITID` a única identidade possível é data + descrição + valor, e essa
 * combinação se repete de fatura em fatura numa assinatura mensal de valor
 * fixo. A competência separa o streaming de agosto do streaming de setembro.
 */
function canonicalScope(target: ImportTarget): string {
  return target.kind === "account" ? targetScope(target) : `${targetScope(target)}${SEPARATOR}${target.competence}`;
}

/**
 * Normaliza a descrição para comparação: minúscula, sem acento, espaços
 * colapsados e sem pontuação de borda.
 *
 * O mesmo estabelecimento chega escrito de formas diferentes conforme o canal
 * — `"MERCADO  SÃO  PAULO  "` no OFX, `"Mercado Sao Paulo"` no CSV — e essas
 * variações não são compras diferentes.
 */
function normalizeDescription(value: string): string {
  return (
    value
      .normalize("NFD")
      // Marcas de acento ficam soltas depois do NFD; removê-las é o que faz
      // "são" e "sao" virarem a mesma chave.
      .replace(/\p{Mn}/gu, "")
      .toLowerCase()
      // O separador vira espaço antes do colapso: uma descrição com "|" no
      // meio deslocaria os campos do fingerprint e poderia imitar outra linha.
      .replace(/[|\s]+/gu, " ")
      .trim()
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
      .trim()
  );
}

/** `FITID` só serve como identidade se tiver conteúdo de fato. */
function externalIdOf(row: ParsedRow): string | null {
  const trimmed = row.externalId?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Identidade composta: alvo, data, descrição normalizada e valor — mais
 * `atual/total` quando a linha é parcela, porque as parcelas de uma mesma
 * compra dividem data e descrição e só se distinguem pelo número.
 *
 * O valor entra como parâmetro para que as variantes de tolerância reusem
 * exatamente a mesma composição.
 */
function compositeFingerprint(row: ParsedRow, target: ImportTarget, amount: Cents): string {
  const fields = [canonicalScope(target), row.date, normalizeDescription(row.description), String(amount)];
  if (row.installment) fields.push(`${row.installment.current}/${row.installment.total}`);
  return fields.join(SEPARATOR);
}

/**
 * Identidade da linha: o `FITID` puro quando o arquivo o traz, senão a
 * composição de alvo, data, descrição e valor.
 */
export function fingerprintOf(row: ParsedRow, target: ImportTarget): string {
  const externalId = externalIdOf(row);
  if (externalId) return `${targetScope(target)}${SEPARATOR}fitid${SEPARATOR}${externalId}`;
  return compositeFingerprint(row, target, row.amount);
}

/**
 * Todas as identidades sob as quais esta linha pode já ter sido gravada: a
 * canônica mais as alternativas.
 *
 * A composta entra sempre, mesmo quando a canônica é o `FITID`. O CSV não tem
 * `FITID`, então uma transação que entrou por CSV está gravada sob a composta;
 * sem essa alternativa, quem importa o CSV da fatura e depois o OFX da mesma
 * fatura vê **tudo** duplicar. O preço é conhecido: duas compras genuinamente
 * iguais no mesmo dia (mesmo valor, mesmo estabelecimento) compartilham a
 * composta, e a segunda cai como duplicada se a primeira veio de CSV. Isso já
 * é limitação da identidade composta, e o veredito só marca a linha na
 * revisão — quem decide é o usuário.
 *
 * As variantes de arredondamento só existem para parcela. Fora dela, um
 * centavo de diferença é outra compra, e tolerar isso fundiria duas despesas
 * legítimas do mesmo dia no mesmo estabelecimento.
 */
export function duplicateCandidates(row: ParsedRow, target: ImportTarget): string[] {
  const candidates = [fingerprintOf(row, target)];
  const push = (candidate: string): void => {
    if (!candidates.includes(candidate)) candidates.push(candidate);
  };

  // Sem `FITID` a canônica já é a composta, e o `push` descarta a repetição.
  push(compositeFingerprint(row, target, row.amount));

  if (row.installment) {
    for (let delta = 1; delta <= INSTALLMENT_CENT_TOLERANCE; delta += 1) {
      push(compositeFingerprint(row, target, cents(row.amount + delta)));
      push(compositeFingerprint(row, target, cents(row.amount - delta)));
    }
  }

  return candidates;
}

/** Verdadeiro quando qualquer identidade possível da linha já é conhecida. */
export function isDuplicate(row: ParsedRow, target: ImportTarget, known: ReadonlySet<string>): boolean {
  return duplicateCandidates(row, target).some((candidate) => known.has(candidate));
}
