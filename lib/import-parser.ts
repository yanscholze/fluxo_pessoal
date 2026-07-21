import type { FinanceCard, FinanceTransaction, TransactionType } from "./finance-types";

export type ImportResult = {
  items: FinanceTransaction[];
  ignored: number;
  ignoredReasons: string[];
  expandedInstallments: number;
};

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[R$\s"]/g, "");
  return Number(cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned);
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function isoDate(value: string) {
  const clean = value.trim().replace(/["']/g, "");
  const br = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return new Date().toISOString().slice(0, 10);
}

function parseCsvRecords(text: string, delimiter: string) {
  const records: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim()); cell = ""; if (row.some(Boolean)) records.push(row); row = [];
    } else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) records.push(row);
  return records;
}

function monthOffset(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const target = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dateInMonth(date: string, month: string) {
  const day = Number(date.slice(8, 10)) || 1;
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function installmentMarker(value: string) {
  const normalized = normalizeHeader(value);
  const match = normalized.match(/(?:parcela\s*)?(\d{1,2})\s*(?:\/|\s+de\s+)(\d{1,2})/i);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || total < 2 || current > total || total > 48) return null;
  return { current, total };
}

export function cleanInstallmentDescription(value: string) {
  const cleaned = value
    .replace(/(?:\s*[-–—|:]\s*)?(?:parcela\s*)?\b\d{1,2}\s*(?:\/|\s+de\s+)\s*\d{1,2}\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–—|:]\s*$/g, "")
    .trim();
  return cleaned || value.trim();
}

function fingerprintOf(date: string, description: string, amount: number, context?: { cardId?: string; invoiceMonth?: string; installments?: string; occurrence?: number }) {
  const base = `${date}|${normalizeHeader(description)}|${amount.toFixed(2)}${(context?.occurrence ?? 1) > 1 ? `|occurrence:${context!.occurrence}` : ""}`;
  if (!context?.invoiceMonth) return base;
  return `invoice:${context.invoiceMonth}|card:${context.cardId ?? "credit"}|installment:${context.installments ?? "single"}|${base}`;
}

function isCardAccount(name: string) { return /ultravioleta|black/i.test(name); }
const invoicePaymentPattern = /pagamento\s+(?:recebido|de\s+fatura|da\s+fatura)|recebimento\s+de\s+pagamento|pagamento\s+efetuado|credit[oó]\s+de\s+pagamento/i;

export function parseCsv(text: string, account: string, card?: FinanceCard, invoiceMonth?: string): ImportResult {
  const firstRecord = text.match(/^[^\r\n]+/)?.[0] ?? "";
  const delimiter = (firstRecord.match(/;/g)?.length ?? 0) > (firstRecord.match(/,/g)?.length ?? 0) ? ";" : ",";
  const records = parseCsvRecords(text, delimiter);
  if (records.length < 2) return { items: [], ignored: 0, ignoredReasons: [], expandedInstallments: 0 };
  const headers = records[0].map(normalizeHeader);
  const find = (terms: string[]) => headers.findIndex((header) => terms.some((term) => header.includes(term)));
  const dateIndex = find(["data", "date"]), descriptionIndex = find(["descricao", "description", "title", "estabelecimento", "memo"]), amountIndex = find(["valor", "amount"]);
  const installmentIndex = find(["parcela", "parcelas", "installment"]);
  if (dateIndex < 0 || descriptionIndex < 0 || amountIndex < 0) return { items: [], ignored: 0, ignoredReasons: [], expandedInstallments: 0 };
  const items: FinanceTransaction[] = []; let ignored = 0; let expandedInstallments = 0; const reasons = new Set<string>(); const occurrences = new Map<string, number>();
  for (const cells of records.slice(1)) {
    const rawAmount = parseMoney(cells[amountIndex] ?? ""); const rawDescription = (cells[descriptionIndex] ?? "Lançamento importado").trim();
    const description = cleanInstallmentDescription(rawDescription);
    if (!description || !Number.isFinite(rawAmount) || rawAmount === 0) { ignored += 1; reasons.add("linhas vazias ou sem valor"); continue; }
    const date = isoDate(cells[dateIndex] ?? ""); const credit = card?.kind === "credit" || isCardAccount(account);
    if (credit && invoicePaymentPattern.test(normalizeHeader(description))) { ignored += 1; reasons.add("pagamentos recebidos pela fatura"); continue; }
    if (credit && rawAmount < 0) { ignored += 1; reasons.add("créditos e estornos do cartão"); continue; }
    const type: TransactionType = rawAmount >= 0 && !credit ? "income" : "expense"; const amount = Math.abs(rawAmount);
    const referenceMonth = credit ? (/^\d{4}-\d{2}$/.test(invoiceMonth ?? "") ? invoiceMonth! : date.slice(0, 7)) : undefined;
    const marker = credit ? installmentMarker(installmentIndex >= 0 ? cells[installmentIndex] ?? "" : "") ?? installmentMarker(rawDescription) : null;
    const occurrenceKey = `${date}|${normalizeHeader(description)}|${amount.toFixed(2)}|${referenceMonth ?? "account"}|${marker ? `${marker.current}/${marker.total}` : "single"}`;
    const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1; occurrences.set(occurrenceKey, occurrence);
    if (credit && referenceMonth && marker) {
      const groupId = createId();
      for (let installment = 1; installment <= marker.total; installment += 1) {
        const targetMonth = monthOffset(referenceMonth, installment - marker.current);
        const installmentDate = installment === marker.current ? date : dateInMonth(date, targetMonth);
        const installments = `${installment}/${marker.total}`;
        items.push({ id: `${groupId}-${installment}`, description, category: "Outros", account, date: installmentDate, amount, type, paymentMethod: "credit", cardId: card?.id, invoiceMonth: targetMonth, installments, status: "confirmed", source: "import", fingerprint: fingerprintOf(installmentDate, description, amount, { cardId: card?.id, invoiceMonth: targetMonth, installments, occurrence }) });
      }
      expandedInstallments += marker.total - 1;
      continue;
    }
    items.push({ id: createId(), description, category: "Outros", account, date, amount, type, paymentMethod: credit ? "credit" : type === "income" ? "transfer" : "debit", cardId: card?.id, invoiceMonth: referenceMonth, status: "confirmed", source: "import", fingerprint: fingerprintOf(date, description, amount, { cardId: card?.id, invoiceMonth: referenceMonth, occurrence }) });
  }
  return { items, ignored, ignoredReasons: [...reasons], expandedInstallments };
}

function ofxValue(block: string, tag: string) { return block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"))?.[1]?.trim() ?? ""; }

export function parseOfx(text: string, account: string): ImportResult {
  const items = text.split(/<STMTTRN>/i).slice(1).flatMap((block) => {
    const rawAmount = Number(ofxValue(block, "TRNAMT").replace(",", ".")); const rawDate = ofxValue(block, "DTPOSTED"); const description = ofxValue(block, "MEMO") || ofxValue(block, "NAME") || "Lançamento importado";
    if (!Number.isFinite(rawAmount) || rawAmount === 0) return [];
    const date = rawDate.match(/^\d{8}/) ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : isoDate(rawDate); const amount = Math.abs(rawAmount); const type = rawAmount >= 0 ? "income" as const : "expense" as const;
    return [{ id: createId(), description, category: "Outros", account, date, amount, type, paymentMethod: type === "income" ? "transfer" as const : "debit" as const, status: "confirmed" as const, source: "import" as const, fingerprint: fingerprintOf(date, description, amount) }];
  });
  return { items, ignored: 0, ignoredReasons: [], expandedInstallments: 0 };
}
