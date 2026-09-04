/**
 * Captura automática de lançamentos por notificação bancária.
 *
 * O Android lê a notificação, o servidor decide o que fazer com ela. A decisão
 * é uma **cascata**: cada degrau descarta o que não deveria virar lançamento,
 * e só o que sobrevive a todos vira uma sugestão para o usuário revisar.
 *
 * Nada entra no razão sem revisão. Uma notificação mal interpretada que virasse
 * lançamento direto corromperia o saldo, e o usuário só descobriria muito
 * depois — sem saber de onde veio o número errado.
 */

import { type Cents, parseMoney } from "../../kernel/money.ts";

/** O que o aparelho envia. */
export type NotificationEvent = {
  /** Pacote do app que emitiu, ex.: `com.nu.production`. */
  readonly sourceApp: string;
  readonly title: string;
  readonly text: string;
  /** Instante em que o Android recebeu, em milissegundos. */
  readonly postedAt: number;
};

/** Por que uma notificação não virou sugestão. */
export type IgnoreReason =
  /** App de carteira, que espelha a notificação do banco e duplicaria tudo. */
  | "carteira"
  /** App fora da lista confiável e sem regra do usuário. */
  | "app_nao_confiavel"
  /** Regra do usuário manda ignorar este app. */
  | "regra_do_usuario"
  /** Não há valor reconhecível no texto. */
  | "sem_valor"
  /** Texto de aviso, não de transação (saldo, limite, promoção). */
  | "nao_e_transacao"
  /** Mesmo valor e estabelecimento numa janela curta. */
  | "duplicada";

export type CaptureOutcome =
  | { readonly kind: "ignored"; readonly reason: IgnoreReason }
  | { readonly kind: "captured"; readonly draft: CapturedDraft };

/** Sugestão de lançamento, aguardando revisão. */
export type CapturedDraft = {
  readonly sourceApp: string;
  readonly rawText: string;
  readonly description: string;
  readonly merchant: string | null;
  readonly amount: Cents;
  readonly kind: "expense" | "income";
  /** Como o dinheiro saiu, inferido do texto. */
  readonly method: "credit" | "debit" | "cash" | "unknown";
  readonly installment: { readonly current: number; readonly total: number } | null;
  /** 0 a 1. Baixa quando o estabelecimento não foi identificado. */
  readonly confidence: number;
  readonly postedAt: number;
};

/**
 * Apps de carteira.
 *
 * Eles espelham a notificação do banco. Aceitar os dois lados criaria duas
 * sugestões para a mesma compra, e a deduplicação por janela não pega porque o
 * texto é diferente.
 */
const WALLET_APPS = [
  "com.samsung.android.spay",
  "com.google.android.apps.walletnfcrel",
  "com.google.android.gms",
  "com.apple.wallet",
];

/** Apps de banco reconhecidos sem o usuário precisar configurar nada. */
const TRUSTED_APPS = [
  "com.nu.production",
  "com.caju.app",
  "com.mercadopago.wallet",
  "br.com.xp.carteira",
  "com.itau",
  "com.bradesco",
  "br.com.bb.android",
  "com.santander.app",
  "com.picpay",
  "com.c6bank.app",
  "br.com.intermedium",
];

/** Regra que o usuário definiu para um app. */
export type SourceRule = {
  readonly sourceApp: string;
  readonly action: "allow" | "ignore";
};

/** Sugestão já registrada, para a checagem de duplicidade. */
export type RecentCapture = {
  readonly amount: Cents;
  readonly merchant: string | null;
  readonly postedAt: number;
};

/** Janela em que a mesma compra chega duas vezes por caminhos diferentes. */
const DUPLICATE_WINDOW_MS = 3 * 60 * 60 * 1000;

/** Confiança quando o estabelecimento foi isolado do texto. */
const CONFIDENCE_WITH_MERCHANT = 0.85;
const CONFIDENCE_WITHOUT_MERCHANT = 0.45;

export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Texto que avisa sobre algo mas não é uma transação.
 *
 * Sem isto, "seu saldo é de R$ 1.234,56" viraria uma despesa de mil e duzentos
 * reais — o pior tipo de erro, porque o valor é grande e plausível.
 */
const NOT_A_TRANSACTION =
  // A segunda alternativa aceita palavras entre o assunto e o verbo: o banco
  // escreve "sua fatura está disponível", não "fatura disponível", e exigir
  // adjacência deixava o aviso passar como se fosse compra.
  /\b(saldo|extrato|promoc\w*|convite|atualiz\w*|seguranca|senha|codigo|token)\b|\b(limite|fatura|cashback|pontos)\b[^.]{0,24}\b(disponivel|liberado|fechou|fechada|acumulad\w*)\b/;

// Os radicais levam `\w*` porque `\b` no fim impediria casar o prefixo:
// `\breceb\b` não casa em "recebeu", já que depois de "receb" vem letra.
const INCOME_HINT =
  /\b(receb\w*|creditad\w*|deposit\w*|estorno\w*|reembols\w*|entrada|credito de|transferencia recebida|pix recebido)\b/;
const CREDIT_HINT = /\b(credito|cartao de credito|parcelad\w*)\b/;
const DEBIT_HINT = /\b(debito|pix|boleto|transferencia|ted|doc)\b/;

/** `R$ 1.234,56` em qualquer lugar do texto. */
const AMOUNT = /r\$\s*([\d.,]+)/i;

/** `3/10`, `parcela 3 de 10`, `em 3x`. */
const INSTALLMENT = /(?:parcela\s*)?\b(\d{1,2})\s*(?:\/|\s+de\s+|x\s+de\s+)\s*(\d{1,2})\b|\bem\s+(\d{1,2})x\b/i;

/** O estabelecimento costuma vir depois de "em", "para" ou "no". */
const MERCHANT = /\b(?:em|no|na|para|pra)\s+([A-Za-zÀ-ÿ0-9][^.,;\n]{2,48})/i;

/**
 * Decide o que fazer com uma notificação.
 *
 * `rules` são as decisões do usuário por app; `recent` são as sugestões já
 * registradas na janela de duplicidade.
 */
export function captureNotification(
  event: NotificationEvent,
  rules: readonly SourceRule[],
  recent: readonly RecentCapture[],
): CaptureOutcome {
  const regra = rules.find((item) => item.sourceApp === event.sourceApp);

  // 1. Carteira nunca entra, mesmo com regra do usuário: a compra já vem pelo
  //    app do banco, e aceitar as duas duplicaria todo lançamento.
  if (WALLET_APPS.includes(event.sourceApp)) {
    return { kind: "ignored", reason: "carteira" };
  }

  // 2. Decisão explícita do usuário manda.
  if (regra?.action === "ignore") {
    return { kind: "ignored", reason: "regra_do_usuario" };
  }

  // 3. Sem regra, só app reconhecido passa. O padrão é não capturar: ler
  //    notificação de todos os apps instalados seria invasivo e ruidoso.
  if (!regra && !TRUSTED_APPS.includes(event.sourceApp)) {
    return { kind: "ignored", reason: "app_nao_confiavel" };
  }

  const texto = normalize(`${event.title} ${event.text}`);

  if (NOT_A_TRANSACTION.test(texto)) {
    return { kind: "ignored", reason: "nao_e_transacao" };
  }

  const amount = extractAmount(event.text);
  if (!amount) {
    return { kind: "ignored", reason: "sem_valor" };
  }

  const kind = INCOME_HINT.test(texto) ? "income" : "expense";
  const merchant = extractMerchant(event.text) ?? (kind === "income" ? extractPayer(event.text) : null);

  if (isDuplicate(amount, merchant, event.postedAt, recent)) {
    return { kind: "ignored", reason: "duplicada" };
  }

  return {
    kind: "captured",
    draft: {
      sourceApp: event.sourceApp,
      rawText: `${event.title} — ${event.text}`.slice(0, 500),
      description: merchant ?? cleanTitle(event.title) ?? "Lançamento automático",
      merchant,
      amount,
      kind,
      method: extractMethod(texto),
      installment: extractInstallment(event.text),
      confidence: merchant ? CONFIDENCE_WITH_MERCHANT : CONFIDENCE_WITHOUT_MERCHANT,
      postedAt: event.postedAt,
    },
  };
}

function extractAmount(text: string): Cents | null {
  const encontrado = AMOUNT.exec(text);
  if (!encontrado) return null;
  const valor = parseMoney(encontrado[1]);
  // Zero não é transação, e negativo não aparece em notificação — o sinal vem
  // do verbo ("recebeu" vs "compra"), não do número.
  return valor && valor > 0 ? valor : null;
}

function extractMerchant(text: string): string | null {
  const encontrado = MERCHANT.exec(text);
  if (!encontrado) return null;

  const bruto = trimPaymentTail(encontrado[1].trim().replace(/\s+/g, " "));
  if (bruto.length < 3) return null;

  // Palavra solta demais para ser estabelecimento ("em 3x", "no crédito"). A
  // comparação é sobre o texto normalizado: sem isso "crédito" com acento
  // escapava do filtro e virava nome de estabelecimento.
  if (/^(\d+x|credito|debito|conta|cartao|parcela|sua|seu|voce)\b/.test(normalize(bruto))) return null;

  // Nome que carrega o valor dentro não é nome: é o recorte errado.
  //
  // Acontece quando o texto tem uma preposição antes do valor — "compra no
  // NUBANK de R$ 55,90 em NETFLIX" — e o recorte começa cedo demais, colhendo
  // "NUBANK de R$ 55". Vira descrição de lançamento sem sentido, e o nome
  // nunca casa com assinatura nem com pagador cadastrado.
  if (/r\$|\d+,\d{2}/.test(normalize(bruto))) return null;

  return bruto.slice(0, 60);
}

const LIGACAO = new Set(["no", "na", "em", "com", "via", "por"]);
const FORMA = /^(credito|debito|cartao|dinheiro|pix|boleto|conta|\d+x)$/;

/**
 * Corta o rabo de forma de pagamento do nome do estabelecimento.
 *
 * A notificação escreve "em MERCADO SAO JOAO no débito", e a captura ia até a
 * pontuação — levando "no débito" junto. O nome sujo quebrava a comparação de
 * duplicidade, porque a segunda notificação da mesma compra costuma descrever
 * o pagamento de outro jeito.
 */
function trimPaymentTail(value: string): string {
  const palavras = value.split(" ");

  for (let indice = 1; indice < palavras.length - 1; indice += 1) {
    if (!LIGACAO.has(normalize(palavras[indice]))) continue;
    if (!FORMA.test(normalize(palavras[indice + 1]))) continue;
    return palavras.slice(0, indice).join(" ");
  }

  return value;
}

/**
 * Nome próprio depois do valor: "recebeu R$ 150,00 **de Maria Silva**".
 *
 * `[Rr]` em vez da flag de caixa: com `/i` o `[A-ZÀ-Ý]` aceitaria minúscula e
 * a exigência de inicial maiúscula — que é o que separa um nome de uma
 * preposição solta — deixaria de valer.
 */
const PAYER = /[Rr]\$\s*[\d.,]+\s*(?:reais\s*)?\bde\s+([A-ZÀ-Ý][^.,;\n]{2,48})/;

/**
 * Quem pagou, numa entrada.
 *
 * Exige inicial maiúscula e vir depois do valor. "de" é preposição comum
 * demais para ser buscada em qualquer posição — em "Compra de R$ 50,00 em
 * LOJA" ela apontaria para o próprio valor.
 */
function extractPayer(text: string): string | null {
  const encontrado = PAYER.exec(text);
  if (!encontrado) return null;

  const bruto = trimPaymentTail(encontrado[1].trim().replace(/\s+/g, " "));
  return bruto.length >= 3 ? bruto.slice(0, 60) : null;
}

function cleanTitle(title: string): string | null {
  const limpo = title.replace(/\s+/g, " ").trim();
  return limpo.length >= 3 ? limpo.slice(0, 60) : null;
}

function extractMethod(normalized: string): CapturedDraft["method"] {
  // Boleto sai da conta, não do cartão — a ordem importa porque um texto pode
  // citar "cartão" e "boleto" na mesma frase.
  if (/\bboleto\b/.test(normalized)) return "debit";
  if (CREDIT_HINT.test(normalized)) return "credit";
  if (DEBIT_HINT.test(normalized)) return "debit";
  return "unknown";
}

function extractInstallment(text: string): CapturedDraft["installment"] {
  const encontrado = INSTALLMENT.exec(text);
  if (!encontrado) return null;

  // `em 3x` só diz o total; a parcela corrente é a primeira.
  if (encontrado[3]) {
    const total = Number(encontrado[3]);
    return total >= 2 && total <= 48 ? { current: 1, total } : null;
  }

  const current = Number(encontrado[1]);
  const total = Number(encontrado[2]);
  if (current < 1 || total < 2 || current > total || total > 48) return null;
  return { current, total };
}

/**
 * Mesma compra chegando duas vezes.
 *
 * O critério é valor **e** estabelecimento numa janela de três horas: o banco
 * às vezes notifica a autorização e depois a confirmação, com textos
 * diferentes. Comparar só o valor descartaria dois cafés iguais no mesmo dia.
 */
function isDuplicate(
  amount: Cents,
  merchant: string | null,
  postedAt: number,
  recent: readonly RecentCapture[],
): boolean {
  const alvo = merchant ? normalize(merchant) : null;

  return recent.some((anterior) => {
    if (anterior.amount !== amount) return false;
    if (Math.abs(anterior.postedAt - postedAt) > DUPLICATE_WINDOW_MS) return false;
    // Sem estabelecimento nos dois lados, o valor sozinho não basta.
    if (!alvo || !anterior.merchant) return false;
    return normalize(anterior.merchant) === alvo;
  });
}

/** Sugestões que envelheceram sem revisão. */
export function isStale(draft: { postedAt: number }, now: number, days = 30): boolean {
  return now - draft.postedAt > days * 86_400_000;
}
