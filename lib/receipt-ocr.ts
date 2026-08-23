import { createStructuredResponse } from "./openai-responses.ts";

export type ReceiptScanResult = {
  merchant: string;
  description: string;
  date: string;
  total: number;
  category: string;
  paymentHint: "credit" | "debit" | "cash" | "unknown";
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  confidence: number;
  warnings: string[];
};

const receiptSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    merchant: { type: "string" },
    description: { type: "string" },
    date: { type: "string", description: "Data no formato YYYY-MM-DD ou string vazia" },
    total: { type: "number" },
    category: { type: "string" },
    paymentHint: { type: "string", enum: ["credit", "debit", "cash", "unknown"] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" }, quantity: { type: "number" },
          unitPrice: { type: "number" }, total: { type: "number" },
        },
        required: ["description", "quantity", "unitPrice", "total"],
      },
    },
    confidence: { type: "number" },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["merchant", "description", "date", "total", "category", "paymentHint", "items", "confidence", "warnings"],
} as const;

function folded(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

function money(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 && numeric <= 100_000_000 ? Math.round(numeric * 100) / 100 : 0;
}

export function normalizeReceiptResult(value: unknown, categories: string[]): ReceiptScanResult {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const available = categories.map((item) => item.trim()).filter(Boolean);
  const suggested = typeof raw.category === "string" ? raw.category : "";
  const normalizedSuggestion = folded(suggested);
  const matchedCategory = available.find((item) => folded(item) === normalizedSuggestion)
    ?? (normalizedSuggestion ? available.find((item) => normalizedSuggestion.includes(folded(item)) || folded(item).includes(normalizedSuggestion)) : undefined)
    ?? available.find((item) => folded(item) === "outros")
    ?? available[0]
    ?? "Outros";
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && Number.isFinite(Date.parse(`${raw.date}T12:00:00Z`)) ? raw.date : "";
  const paymentHint = ["credit", "debit", "cash"].includes(String(raw.paymentHint)) ? raw.paymentHint as ReceiptScanResult["paymentHint"] : "unknown";
  const items = Array.isArray(raw.items) ? raw.items.slice(0, 40).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>; const description = typeof row.description === "string" ? row.description.trim().slice(0, 160) : "";
    if (!description) return [];
    const quantity = Number(row.quantity);
    return [{ description, quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1, unitPrice: money(row.unitPrice), total: money(row.total) }];
  }) : [];
  const merchant = typeof raw.merchant === "string" ? raw.merchant.trim().slice(0, 160) : "";
  const description = (typeof raw.description === "string" ? raw.description.trim() : "").slice(0, 180) || merchant || "Compra por cupom";
  const confidence = Number(raw.confidence);
  return {
    merchant, description, date, total: money(raw.total), category: matchedCategory, paymentHint, items,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 180)).filter(Boolean).slice(0, 6) : [],
  };
}

export async function analyzeReceipt(input: { apiKey: string; model: string; imageBase64: string; mimeType: string; categories: string[] }) {
  const categoryList = input.categories.length ? input.categories.join(", ") : "Outros";
  const extracted = await createStructuredResponse<unknown>({
    apiKey: input.apiKey,
    model: input.model,
    schemaName: "receipt_scan",
    schema: receiptSchema,
    maxOutputTokens: 1800,
    system: `Você extrai dados de cupons fiscais brasileiros. Leia somente o que estiver visível e nunca invente. Identifique estabelecimento, data da compra, valor total efetivamente pago, meio de pagamento e itens. Não confunda subtotal, troco, desconto, valor recebido ou tributos com o total. Escolha uma categoria exatamente desta lista: ${categoryList}. Use números em reais, data YYYY-MM-DD e confiança entre 0 e 1. Se algo não estiver legível, use string vazia, zero ou unknown e descreva em warnings.`,
    content: [
      { type: "input_text", text: "Extraia os dados deste cupom para preencher um lançamento financeiro. O usuário confirmará tudo antes de salvar." },
      { type: "input_image", image_url: `data:${input.mimeType};base64,${input.imageBase64}`, detail: "high" },
    ],
  });
  return normalizeReceiptResult(extracted, input.categories);
}
