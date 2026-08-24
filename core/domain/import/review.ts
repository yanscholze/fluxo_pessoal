/**
 * Normalização e montagem da revisão.
 *
 * Este é o estágio que transforma linhas cruas do arquivo em itens que o
 * usuário consegue julgar: cada linha ganha um veredito, um tipo e uma
 * sugestão de categoria — e **nenhuma decisão**. Tudo nasce `pendente` porque
 * importar sem revisão é o caminho mais curto para um extrato em que ninguém
 * confia mais.
 */

import { isNegative } from "../../kernel/money.ts";
import { fingerprintOf, isDuplicate } from "./fingerprint.ts";
import type { ImportTarget, ParseResult, ParsedRow, ReviewItem, ReviewVerdict } from "./types.ts";

export type ReviewContext = {
  readonly target: ImportTarget;
  readonly knownFingerprints: ReadonlySet<string>;
  /** Regras de categorização: texto do estabelecimento -> categoria. */
  readonly categoryRules: readonly { readonly match: string; readonly categoryId: string }[];
  /** Contas do usuário, para detectar transferência interna. */
  readonly accounts: readonly { readonly id: string; readonly name: string }[];
};

/**
 * Forma canônica de um texto para comparação: minúscula, sem acento, espaços
 * colapsados.
 *
 * Extrato bancário não tem padrão de caixa nem de acentuação — o mesmo
 * estabelecimento vem como `SUPERMERCADO SÃO JOÃO`, `Supermercado Sao Joao` e
 * `SUPERMERCADO  SAO   JOAO`. Comparar as três formas cruas faria a regra do
 * usuário casar num mês e falhar no seguinte.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    // `\p{M}` apaga os diacríticos que o NFD acabou de separar das letras:
    // "SÃO" vira "SAO" sem tabela de-para de caractere por caractere.
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Marcas genéricas de movimentação entre contas. Casa contra texto já
 * normalizado — daí não haver variante acentuada nem flag de caixa.
 *
 * `ted` e `doc` precisam de fronteira de palavra dos **dois** lados: exigir só
 * o espaço à direita deixava `united airlines` e `services limited ltda` virarem
 * "possível transferência", e perdia um `pagamento ted` que termina a linha.
 * `transferencia` fica sem fronteira à direita para pegar o plural.
 */
const TRANSFER_PATTERN = /\btransferencia|\bted\b|\bdoc\b|\bpix (enviado|recebido)\b/;

type CompiledRule = { readonly needle: string; readonly categoryId: string };
type CompiledAccount = { readonly needle: string; readonly id: string };

export function buildReview(parsed: ParseResult, context: ReviewContext): ReviewItem[] {
  const rules = compileRules(context.categoryRules);
  const accounts = compileAccounts(context.accounts, context.target);
  return parsed.rows.map((row) => reviewRow(row, context, rules, accounts));
}

function reviewRow(
  row: ParsedRow,
  context: ReviewContext,
  rules: readonly CompiledRule[],
  accounts: readonly CompiledAccount[],
): ReviewItem {
  const description = normalizeText(row.description);
  const suggestedCategoryId = rules.find((rule) => description.includes(rule.needle))?.categoryId ?? null;
  const transfer = detectTransfer(description, accounts);

  return {
    row,
    fingerprint: fingerprintOf(row, context.target),
    verdict: decideVerdict(row, context, transfer !== null, suggestedCategoryId),
    // Zero não é saída; só o sinal negativo caracteriza despesa.
    kind: isNegative(row.amount) ? "expense" : "income",
    suggestedCategoryId,
    transferCounterpartId: transfer?.counterpartId ?? null,
    decision: "pendente",
  };
}

/**
 * A ordem importa e não é arbitrária.
 *
 * Duplicado vem primeiro porque é o único veredito que diz "isso já existe":
 * marcar uma linha repetida como transferência a esconderia atrás de uma
 * decisão que o usuário tomaria achando que é dinheiro novo. Transferência vem
 * antes de categoria porque transferência não tem categoria — não é gasto.
 */
function decideVerdict(
  row: ParsedRow,
  context: ReviewContext,
  looksLikeTransfer: boolean,
  suggestedCategoryId: string | null,
): ReviewVerdict {
  if (isDuplicate(row, context.target, context.knownFingerprints)) return "duplicado";
  if (looksLikeTransfer) return "possivel_transferencia";
  if (suggestedCategoryId === null) return "sem_categoria";
  return "novo";
}

/**
 * O nome da conta tem prioridade sobre o padrão genérico: saber que o outro
 * lado é a "Conta Corrente Itaú" permite propor a transferência já pareada,
 * enquanto um `TED` solto só permite levantar a suspeita.
 */
function detectTransfer(
  description: string,
  accounts: readonly CompiledAccount[],
): { readonly counterpartId: string | null } | null {
  const account = accounts.find((candidate) => description.includes(candidate.needle));
  if (account) return { counterpartId: account.id };
  return TRANSFER_PATTERN.test(description) ? { counterpartId: null } : null;
}

/**
 * Regras mais longas primeiro: `mercado livre` e `mercado` casam na mesma
 * descrição, e quem escreveu a regra mais específica quis exatamente que ela
 * ganhasse. `sort` estável mantém a ordem de declaração no empate.
 */
function compileRules(rules: readonly { readonly match: string; readonly categoryId: string }[]): CompiledRule[] {
  return rules
    .map((rule) => ({ needle: normalizeText(rule.match), categoryId: rule.categoryId }))
    // Uma regra vazia casaria com qualquer descrição — é ruído de cadastro.
    .filter((rule) => rule.needle.length > 0)
    .sort((left, right) => right.needle.length - left.needle.length);
}

/**
 * A conta que está recebendo o arquivo fica de fora: transferência tem dois
 * lados diferentes, e o nome dela aparece na própria descrição com frequência
 * (`TARIFA MENSAL CONTA CORRENTE`). Mantê-la na lista propunha uma
 * transferência da conta para ela mesma — que o cadastro depois recusaria — e
 * ainda escondia a linha atrás do veredito de transferência.
 */
function compileAccounts(
  accounts: readonly { readonly id: string; readonly name: string }[],
  target: ImportTarget,
): CompiledAccount[] {
  const targetAccountId = target.kind === "account" ? target.accountId : null;
  return accounts
    .filter((account) => account.id !== targetAccountId)
    .map((account) => ({ needle: normalizeText(account.name), id: account.id }))
    .filter((account) => account.needle.length > 0)
    .sort((left, right) => right.needle.length - left.needle.length);
}
