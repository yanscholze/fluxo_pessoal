import type { FinanceCard, FinanceTransaction, TransactionType } from "./types";
import { monthOffset } from "./finance-period.ts";

export type MobileImportContext = { account: string; card?: FinanceCard; invoiceMonth?: string };
export type MobileImportResult = { items: FinanceTransaction[]; ignored: number; expandedInstallments: number; firstMonth?: string; lastMonth?: string };

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(); }

function parseMoney(value: unknown) {
  if (typeof value === "number") return value;
  const clean = String(value ?? "").replace(/[R$\s"]/g, "");
  return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean);
}

function isoDate(value: unknown) {
  const clean = String(value ?? "").trim().replace(/["']/g, "");
  const br = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  const iso = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const ofx = clean.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofx) return `${ofx[1]}-${ofx[2]}-${ofx[3]}`;
  return "";
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

function fingerprint(date: string, description: string, amount: number, context: MobileImportContext, installments?: string, occurrence = 1) {
  const base = `${date}|${normalize(description)}|${amount.toFixed(2)}${occurrence > 1 ? `|occurrence:${occurrence}` : ""}`;
  return context.card?.kind === "credit" ? `invoice:${context.invoiceMonth ?? date.slice(0, 7)}|card:${context.card.id}|installment:${installments ?? "single"}|${base}` : base;
}

function marker(value: string) {
  const match = normalize(value).match(/(?:parcela\s*)?(\d{1,2})\s*(?:\/|\s+de\s+)(\d{1,2})/);
  if (!match) return null;
  const current = Number(match[1]); const total = Number(match[2]);
  return current >= 1 && total >= 2 && current <= total && total <= 48 ? { current, total } : null;
}

function cleanInstallmentDescription(value: string) {
  const cleaned = value
    .replace(/(?:\s*[-–—|:]\s*)?(?:parcela\s*)?\b\d{1,2}\s*(?:\/|\s+de\s+)\s*\d{1,2}\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*[-–—|:]\s*$/g, "")
    .trim();
  return cleaned || value.trim();
}

const invoicePaymentPattern = /pagamento\s+(?:recebido|de\s+fatura|da\s+fatura)|recebimento\s+de\s+pagamento|pagamento\s+efetuado|credit[oó]\s+de\s+pagamento/i;

function dateInMonth(date: string, month: string) {
  const day = Number(date.slice(8, 10)) || 1; const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function buildItems(input: { date: string; description: string; amount: number; type: TransactionType; category?: string; account?: string; installments?: string; occurrence?: number }, context: MobileImportContext) {
  const account = input.account || context.account; const category = input.category || (input.type === "income" ? "Receita" : "Outros");
  const detected = context.card?.kind === "credit" ? marker(input.installments ?? "") ?? marker(input.description) : null;
  const description = detected ? cleanInstallmentDescription(input.description) : input.description;
  const referenceMonth = context.invoiceMonth ?? input.date.slice(0, 7);
  const make = (installment: number | null, total: number | null): FinanceTransaction => {
    const invoiceMonth = installment && total && detected ? monthOffset(referenceMonth, installment - detected.current) : context.card?.kind === "credit" ? referenceMonth : undefined;
    const installments = installment && total ? `${installment}/${total}` : undefined;
    const date = invoiceMonth && installments && installment !== detected?.current ? dateInMonth(input.date, invoiceMonth) : input.date;
    const key = fingerprint(date, description, input.amount, { ...context, account }, installments, input.occurrence);
    return {
      id: `legacy-${stableHash(key)}`, description, category, account, date, amount: input.amount,
      type: context.card?.kind === "credit" ? "expense" : input.type,
      paymentMethod: context.card?.kind === "credit" ? "credit" : input.type === "income" ? "transfer" : "debit",
      cardId: context.card?.id, invoiceMonth, installments, status: "confirmed", source: "import", fingerprint: key, version: 0,
    };
  };
  if (!detected) return [make(null, null)];
  return Array.from({ length: detected.total }, (_, index) => make(index + 1, detected.total));
}

function csvRecords(text: string) {
  const first = text.match(/^[^\r\n]+/)?.[0] ?? ""; const delimiter = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const records: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index += 1; row.push(cell.trim()); if (row.some(Boolean)) records.push(row); row = []; cell = ""; }
    else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) records.push(row);
  return records;
}

function parseCsv(text: string, context: MobileImportContext) {
  const records = csvRecords(text); if (records.length < 2) return { items: [], ignored: 0, expandedInstallments: 0 };
  const headers = records[0].map(normalize); const find = (terms: string[]) => headers.findIndex((header) => terms.some((term) => header.includes(term)));
  const indexes = {
    date: find(["data", "date"]), description: find(["descricao", "description", "title", "estabelecimento", "memo"]), amount: find(["valor", "amount"]),
    category: find(["categoria", "category"]), account: find(["conta", "account"]), type: find(["tipo", "type"]), installments: find(["parcela", "installment"]),
  };
  if (indexes.date < 0 || indexes.description < 0 || indexes.amount < 0) return { items: [], ignored: records.length - 1, expandedInstallments: 0 };
  const items: FinanceTransaction[] = []; let ignored = 0; let expandedInstallments = 0; const occurrences = new Map<string, number>();
  for (const row of records.slice(1)) {
    const date = isoDate(row[indexes.date]); const description = String(row[indexes.description] ?? "").trim(); const rawAmount = parseMoney(row[indexes.amount]);
    if (!date || !description || !Number.isFinite(rawAmount) || rawAmount === 0) { ignored += 1; continue; }
    if (context.card?.kind === "credit" && (rawAmount < 0 || invoicePaymentPattern.test(normalize(description)))) { ignored += 1; continue; }
    const explicit = indexes.type >= 0 ? normalize(row[indexes.type] ?? "") : "";
    const type: TransactionType = /entrada|income|receita|credito/.test(explicit) ? "income" : /saida|expense|despesa|debito/.test(explicit) ? "expense" : rawAmount < 0 ? "expense" : "income";
    const occurrenceKey = `${date}|${normalize(description)}|${Math.abs(rawAmount).toFixed(2)}|${indexes.installments >= 0 ? row[indexes.installments] : ""}`; const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1; occurrences.set(occurrenceKey, occurrence);
    const built = buildItems({ date, description, amount: Math.abs(rawAmount), type, category: indexes.category >= 0 ? row[indexes.category] : undefined, account: indexes.account >= 0 ? row[indexes.account] : undefined, installments: indexes.installments >= 0 ? row[indexes.installments] : undefined, occurrence }, context);
    items.push(...built); expandedInstallments += Math.max(0, built.length - 1);
  }
  return { items, ignored, expandedInstallments };
}

function ofxValue(block: string, tag: string) { return block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"))?.[1]?.trim() ?? ""; }

function parseOfx(text: string, context: MobileImportContext) {
  const occurrences = new Map<string, number>(); const items = text.split(/<STMTTRN>/i).slice(1).flatMap((block) => {
    const rawAmount = parseMoney(ofxValue(block, "TRNAMT")); const date = isoDate(ofxValue(block, "DTPOSTED")); const description = ofxValue(block, "MEMO") || ofxValue(block, "NAME");
    if (!date || !description || !Number.isFinite(rawAmount) || rawAmount === 0 || (context.card?.kind === "credit" && (rawAmount < 0 || invoicePaymentPattern.test(normalize(description))))) return [];
    const occurrenceKey = `${date}|${normalize(description)}|${Math.abs(rawAmount).toFixed(2)}`; const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1; occurrences.set(occurrenceKey, occurrence);
    return buildItems({ date, description, amount: Math.abs(rawAmount), type: rawAmount < 0 ? "expense" : "income", occurrence }, context);
  });
  return { items, ignored: 0, expandedInstallments: 0 };
}

function parseJson(text: string, context: MobileImportContext) {
  const parsed = JSON.parse(text) as unknown; const rows = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? (parsed as { transactions?: unknown[]; lancamentos?: unknown[] }).transactions ?? (parsed as { lancamentos?: unknown[] }).lancamentos ?? [] : [];
  const items: FinanceTransaction[] = []; let ignored = 0; let expandedInstallments = 0; const occurrences = new Map<string, number>();
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") { ignored += 1; continue; }
    const row = raw as Record<string, unknown>; const date = isoDate(row.date ?? row.data ?? row.occurredAt); const description = String(row.description ?? row.descricao ?? row.title ?? "").trim(); const rawAmount = parseMoney(row.amount ?? row.valor);
    if (!date || !description || !Number.isFinite(rawAmount) || rawAmount === 0) { ignored += 1; continue; }
    if (context.card?.kind === "credit" && (rawAmount < 0 || invoicePaymentPattern.test(normalize(description)))) { ignored += 1; continue; }
    const explicit = normalize(String(row.type ?? row.tipo ?? "")); const type: TransactionType = /entrada|income|receita/.test(explicit) ? "income" : /saida|expense|despesa/.test(explicit) ? "expense" : rawAmount < 0 ? "expense" : "income";
    const installmentText = String(row.installments ?? row.parcelas ?? row.parcela ?? ""); const occurrenceKey = `${date}|${normalize(description)}|${Math.abs(rawAmount).toFixed(2)}|${installmentText}`; const occurrence = (occurrences.get(occurrenceKey) ?? 0) + 1; occurrences.set(occurrenceKey, occurrence);
    const built = buildItems({ date, description, amount: Math.abs(rawAmount), type, category: String(row.category ?? row.categoria ?? ""), account: String(row.account ?? row.conta ?? ""), installments: installmentText, occurrence }, context);
    items.push(...built); expandedInstallments += Math.max(0, built.length - 1);
  }
  return { items, ignored, expandedInstallments };
}

export function parseImportedText(text: string, extension: string, context: MobileImportContext): MobileImportResult {
  const parsed = extension.toLowerCase() === "ofx" ? parseOfx(text, context) : extension.toLowerCase() === "json" ? parseJson(text, context) : parseCsv(text, context);
  const months = parsed.items.map((item) => item.invoiceMonth ?? item.date.slice(0, 7)).sort();
  return { ...parsed, firstMonth: months[0], lastMonth: months.at(-1) };
}
