/**
 * Lógica compartilhada do pipeline de "Lançamentos Automáticos por Notificação".
 *
 * Fluxo (ver app/api/v1/notifications/route.ts):
 *  1. App de origem é da Samsung Wallet/Google Wallet? -> ignorado sempre (reward/confirmação, não é gasto real).
 *  2. App não está na lista de apps financeiros confiáveis (nem tem regra manual liberando)? -> ignorado.
 *  3. Bate com um lançamento recente (mesmo valor + estabelecimento normalizado + janela de tempo)? -> duplicado.
 *  4. Confiança da extração é baixa? -> vai para a fila de revisão (pendingAutoTransactions), sem afetar saldo.
 *  5. Caso contrário -> cria o lançamento de verdade direto (autoImported=true, reviewStatus="new").
 */

export const WALLET_PACKAGE_KEYWORDS = ["samsung.android.spay", "samsung.android.spaylite", "samsung.android.rewards", "google.android.apps.walletnfcrel", "google.android.apps.wallet"];

export const TRUSTED_APP_KEYWORDS: Record<string, string> = {
  "nu.production": "Nubank",
  "nubank": "Nubank",
  "caju.mobile": "Caju",
  "com.caju": "Caju",
  "mercadopago": "Mercado Pago",
  "xpi.app": "XP Investimentos",
  "xp.com": "XP Investimentos",
};

export function normalizeEstablishment(value: string): string {
  return value
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isWalletPackage(packageName: string): boolean {
  const normalized = packageName.toLowerCase();
  return WALLET_PACKAGE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function guessTrustedApp(packageName: string): string | null {
  const normalized = packageName.toLowerCase();
  for (const [keyword, label] of Object.entries(TRUSTED_APP_KEYWORDS)) {
    if (normalized.includes(keyword)) return label;
  }
  return null;
}

export type ParsedNotification = {
  description: string;
  amount: number;
  type: "expense" | "income";
  confidence: number;
  /** "credit" -> deve cair no cartão configurado; "debit"/"boleto"/"other" -> deve cair na conta configurada. */
  paymentMethod: "credit" | "debit" | "boleto" | "other";
  /** Total de parcelas, quando a notificação menciona ("em 3x", "3x de R$..."). */
  installmentsTotal?: number;
};

/**
 * Extração best-effort a partir do texto da notificação. Bancos mudam o texto
 * das notificações com frequência, então isso é heurístico por natureza — daí
 * a confiança calculada, que decide se o lançamento entra direto ou vai para
 * revisão manual.
 *
 * O Nubank, por exemplo, manda textos bem diferentes conforme o tipo:
 *  - "Compra aprovada" no crédito -> deve virar lançamento no CARTÃO
 *  - "Compra no débito" / "Pix enviado" -> deve virar lançamento na CONTA
 *  - "Boleto pago" -> também é a CONTA, não o cartão
 * Por isso paymentMethod é decidido aqui a partir do texto, não fixo por app.
 */
export function parseNotificationText(rawText: string): ParsedNotification | null {
  const amountMatch = rawText.match(/R\$\s?([\d.]+,\d{2})/);
  if (!amountMatch) return null;
  const amount = Number(amountMatch[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const isIncome = /receb|creditad|entrada|dep[oó]sito/i.test(rawText);
  const type: "expense" | "income" = isIncome ? "income" : "expense";

  const isBoleto = /boleto/i.test(rawText);
  const isCredit = /cr[eé]dito/i.test(rawText);
  const isDebit = /d[eé]bito|pix/i.test(rawText);
  const paymentMethod: ParsedNotification["paymentMethod"] = isBoleto ? "boleto" : isCredit ? "credit" : isDebit ? "debit" : "other";

  // "em 3x", "3x de R$ 50,00", "parcelado em 3 vezes"
  const installmentMatch = rawText.match(/(?:em\s+)?(\d{1,2})\s*x\b|parcelad[oa]\s+em\s+(\d{1,2})\s+vezes/i);
  const installmentsTotal = installmentMatch ? Number(installmentMatch[1] ?? installmentMatch[2]) : undefined;

  // Tenta pegar o nome do estabelecimento depois de "em"/"para"/"de", padrão comum
  // em notificações de compra ("Compra aprovada em MERCADO XYZ").
  const establishmentMatch = rawText.match(/(?:em|para|de)\s+([A-ZÀ-Ú][\w .,-]{2,40})/);
  const description = establishmentMatch?.[1]?.trim() || rawText.slice(0, 60).trim();

  // Confiança simples: temos valor + um nome de estabelecimento plausível -> alta.
  // Só o valor, sem conseguir isolar uma descrição melhor que o próprio texto cru -> baixa.
  const confidence = establishmentMatch ? 0.85 : 0.45;

  return { description, amount, type, confidence, paymentMethod, installmentsTotal };
}

export type DedupCandidate = { description: string; amount: number; date: string; cardId?: string; account?: string };

/** Janela de tempo (em ms) considerada para detectar duplicidade entre notificações e lançamentos existentes. */
export const DEDUP_WINDOW_MS = 3 * 60 * 60 * 1000;

export function isLikelyDuplicate(incoming: DedupCandidate, existing: DedupCandidate, incomingPostedAt: Date, existingPostedAt: Date): boolean {
  if (Math.abs(incoming.amount - existing.amount) > 0.005) return false;
  if (normalizeEstablishment(incoming.description) !== normalizeEstablishment(existing.description)) return false;
  if (incoming.cardId && existing.cardId && incoming.cardId !== existing.cardId) return false;
  if (incoming.account && existing.account && incoming.cardId == null && existing.cardId == null && incoming.account !== existing.account) return false;
  return Math.abs(incomingPostedAt.getTime() - existingPostedAt.getTime()) <= DEDUP_WINDOW_MS;
}
