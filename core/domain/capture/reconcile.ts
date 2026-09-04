/**
 * Conciliação de recebimento: ligar um pix que chegou ao que ele paga.
 *
 * A notificação de um pix traz quem pagou e quanto. O Fluxo já sabe quanto
 * cada cliente deve, quando o salário costuma cair e qual conta é o vale. Este
 * módulo faz a ponte — e a faz com uma régua deliberadamente severa.
 *
 * **Só casamento perfeito vira baixa automática.** Nome equivalente *e* valor
 * idêntico ao centavo. Qualquer outra coisa — valor parecido, nome parecido,
 * dois candidatos possíveis — vira sugestão na fila de revisão, com o
 * candidato já apontado.
 *
 * O motivo é assimetria de dano. Uma sugestão errada custa um toque para
 * descartar. Uma baixa errada registra dinheiro de um cliente no projeto de
 * outro, some da lista de "a receber", e só aparece meses depois — quando
 * ninguém lembra de onde veio. Entre errar para mais trabalho e errar para
 * número errado, este produto erra para mais trabalho.
 */

import type { Cents } from "../../kernel/money.ts";
import type { LocalDate } from "../../time/local-date.ts";
import { normalize } from "./notification.ts";

/** O que o pix pode estar pagando. */
export type ReceiptTarget =
  /** Uma parcela de contrato de projeto. */
  | { readonly kind: "project"; readonly paymentId: string; readonly projectId: string; readonly projectName: string }
  /** O salário. Não precisa de parcela cadastrada: o valor é o que chegou. */
  | { readonly kind: "salary" }
  /** Crédito de benefício, como o vale-alimentação. */
  | { readonly kind: "benefit" };

/**
 * Um candidato a receber a baixa.
 *
 * `expectedAmount` é `null` quando não há valor esperado — salário variável,
 * benefício que muda por dia útil. Nesses casos **nunca** há casamento
 * perfeito por valor, e a regra abaixo garante que a baixa não seja automática
 * sem que alguém tenha dito qual é o valor certo.
 */
export type ReceiptCandidate = {
  readonly target: ReceiptTarget;
  /**
   * A regra que produziu este candidato.
   *
   * Fica no candidato, e não no alvo, porque **todo** candidato vem de uma
   * regra — inclusive os de projeto. Guardá-la só nos alvos sem parcela fazia
   * a conciliação de projeto esquecer qual regra a reconheceu, e o "sim" na
   * fila de revisão não tinha como saber em que conta creditar.
   */
  readonly ruleId: string;
  /** Nome do pagador como o usuário cadastrou. */
  readonly payerName: string;
  readonly expectedAmount: Cents | null;
  /** Vencimento, quando existe. Serve para ordenar candidatos empatados. */
  readonly dueOn: LocalDate | null;
  /** Conta em que o dinheiro cai. */
  readonly accountId: string;
  readonly categoryId: string | null;
};

/** O que chegou. */
export type IncomingReceipt = {
  /** Quem pagou, como veio no texto da notificação. */
  readonly payer: string | null;
  readonly amount: Cents;
};

export type ReceiptMatch =
  /**
   * Nome equivalente e valor idêntico, e **um único** candidato assim. Pode
   * dar baixa sozinho.
   */
  | { readonly kind: "exact"; readonly candidate: ReceiptCandidate }
  /**
   * Há candidato plausível, mas não perfeito. Vai para a fila com ele
   * apontado; quem decide é o usuário.
   */
  | {
      readonly kind: "suggested";
      readonly candidate: ReceiptCandidate;
      readonly reason: SuggestionReason;
    }
  | { readonly kind: "none" };

export type SuggestionReason =
  /** O nome casa, mas o valor não bate com o esperado. */
  | "valor_diferente"
  /** O nome casa e não há valor esperado para conferir. */
  | "sem_valor_esperado"
  /** Mais de um candidato casaria: escolher por conta própria seria chutar. */
  | "varios_candidatos";

/**
 * Nomes equivalentes.
 *
 * O extrato traz a razão social — "PADARIA DO BAIRRO LTDA", "JOAO DA SILVA
 * ME" — e o usuário cadastra o nome de tratamento. Comparar por igualdade
 * exata reprovaria quase tudo; comparar por "contém" nos dois sentidos aceita
 * o sufixo societário sem aceitar qualquer coisa.
 *
 * O piso de tamanho existe para "ana" não casar com "ana paula", "santana" e
 * "banana": abaixo dele, exige-se igualdade.
 */
const TAMANHO_MINIMO_PARA_CONTER = 5;

export function samePayer(cadastrado: string, recebido: string): boolean {
  const esperado = normalize(cadastrado);
  const veio = normalize(recebido);

  if (!esperado || !veio) return false;
  if (esperado === veio) return true;
  if (esperado.length < TAMANHO_MINIMO_PARA_CONTER) return false;

  return veio.includes(esperado) || esperado.includes(veio);
}

/**
 * Decide o que fazer com um recebimento.
 *
 * A ordem importa: primeiro reduz aos candidatos cujo nome casa, e só então
 * olha o valor. Um pix de R$ 3.000 não deve casar com a parcela de R$ 3.000 de
 * *outro* cliente só porque o número bate.
 */
export function matchReceipt(
  receipt: IncomingReceipt,
  candidates: readonly ReceiptCandidate[],
): ReceiptMatch {
  if (!receipt.payer) return { kind: "none" };

  const porNome = candidates.filter((candidato) => samePayer(candidato.payerName, receipt.payer!));
  if (!porNome.length) return { kind: "none" };

  const perfeitos = porNome.filter(
    (candidato) => candidato.expectedAmount !== null && candidato.expectedAmount === receipt.amount,
  );

  // Exatamente um casamento perfeito: é o único caso que dispensa decisão.
  if (perfeitos.length === 1) return { kind: "exact", candidate: perfeitos[0] };

  // Dois candidatos com o mesmo nome e o mesmo valor acontece de verdade: duas
  // parcelas iguais do mesmo contrato. Escolher a mais antiga por conta própria
  // seria um palpite razoável — e palpite razoável sobre dinheiro é o que este
  // módulo existe para não fazer.
  if (perfeitos.length > 1) {
    return { kind: "suggested", candidate: maisUrgente(perfeitos), reason: "varios_candidatos" };
  }

  const semValorEsperado = porNome.filter((candidato) => candidato.expectedAmount === null);

  // Salário e benefício caem aqui: o nome casa, não há valor a conferir, e por
  // isso a baixa nunca é automática.
  if (semValorEsperado.length === 1 && porNome.length === 1) {
    return { kind: "suggested", candidate: semValorEsperado[0], reason: "sem_valor_esperado" };
  }

  if (porNome.length === 1) {
    return { kind: "suggested", candidate: porNome[0], reason: "valor_diferente" };
  }

  return { kind: "suggested", candidate: maisUrgente(porNome), reason: "varios_candidatos" };
}

/**
 * Entre candidatos empatados, o que vence primeiro.
 *
 * Só decide qual **sugerir** — nunca qual receber baixa. Sem vencimento, mantém
 * a ordem de entrada, que é a do banco.
 */
function maisUrgente(candidatos: readonly ReceiptCandidate[]): ReceiptCandidate {
  return [...candidatos].sort((esquerda, direita) => {
    if (esquerda.dueOn === direita.dueOn) return 0;
    if (esquerda.dueOn === null) return 1;
    if (direita.dueOn === null) return -1;
    return esquerda.dueOn < direita.dueOn ? -1 : 1;
  })[0];
}

// ---------------------------------------------------------------------------
// Assinatura reconhecida
// ---------------------------------------------------------------------------

/** Uma assinatura ativa, do jeito que o reconhecimento precisa dela. */
export type KnownSubscription = {
  readonly recurrenceId: string;
  readonly description: string;
  readonly amount: Cents;
  /** Cartão em que ela é cobrada, quando há. */
  readonly cardId: string | null;
};

/**
 * A cobrança da notificação é de uma assinatura conhecida?
 *
 * Serve a um propósito diferente da conciliação de recebimento: aqui não se
 * decide dar baixa, decide-se **onde a informação mora**. Uma cobrança da
 * Netflix não tem o que ser revisado — ela já foi cadastrada, o valor já é
 * conhecido, e a única coisa que a fila de revisão acrescentaria é um item
 * repetido todo mês para o usuário confirmar o que ele mesmo agendou.
 *
 * A régua é mais frouxa que a da baixa automática, e de propósito: o dano de
 * errar aqui é uma cobrança aparecer na aba de assinaturas em vez da fila de
 * captura — nada de dinheiro é registrado por esta decisão. Basta o nome
 * bater.
 */
export function matchSubscription(
  charge: { readonly merchant: string | null; readonly amount: Cents; readonly cardId?: string | null },
  subscriptions: readonly KnownSubscription[],
): KnownSubscription | null {
  if (!charge.merchant) return null;

  const candidatas = subscriptions.filter((assinatura) =>
    samePayer(assinatura.description, charge.merchant!),
  );
  if (!candidatas.length) return null;
  if (candidatas.length === 1) return candidatas[0];

  // Duas assinaturas com nome equivalente: desempata pelo valor, e só depois
  // pelo cartão. Sem desempate, a primeira serve — nenhuma das duas move
  // dinheiro por esta escolha.
  return (
    candidatas.find((assinatura) => assinatura.amount === charge.amount) ??
    candidatas.find((assinatura) => assinatura.cardId === charge.cardId) ??
    candidatas[0]
  );
}
