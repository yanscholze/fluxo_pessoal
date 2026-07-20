import { env } from "cloudflare:workers";
import { consumeAiQuota } from "../../../../../lib/ai-quota";
import { apiIdentityFrom, apiUnauthorized } from "../../../../../lib/api-v1-auth";
import { analyzeReceipt } from "../../../../../lib/receipt-ocr";

const headers = { "cache-control": "no-store", "x-fluxo-api-version": "1" };

function apiConfig() {
  const values = env as unknown as { OPENAI_API_KEY?: string; OPENAI_RECEIPT_MODEL?: string };
  return { apiKey: values.OPENAI_API_KEY?.trim() || "", model: values.OPENAI_RECEIPT_MODEL?.trim() || "gpt-5.6" };
}

export async function POST(request: Request) {
  const identity = await apiIdentityFrom(request);
  if (!identity) return apiUnauthorized();
  try {
    const payload = await request.json() as { imageBase64?: unknown; mimeType?: unknown; categories?: unknown };
    const imageBase64 = typeof payload.imageBase64 === "string" ? payload.imageBase64.trim() : "";
    const mimeType = typeof payload.mimeType === "string" ? payload.mimeType.trim().toLowerCase() : "";
    const categories = Array.isArray(payload.categories)
      ? payload.categories.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 80)).filter(Boolean).slice(0, 100)
      : [];
    if (!imageBase64 || imageBase64.length > 10_500_000 || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      return Response.json({ error: "Imagem de cupom inválida" }, { status: 400, headers });
    }
    const config = apiConfig();
    if (!config.apiKey) return Response.json({ error: "Leitura inteligente ainda não está configurada" }, { status: 503, headers });
    await consumeAiQuota(identity.ownerId, "receipt-ocr", 30);
    const receipt = await analyzeReceipt({ ...config, imageBase64, mimeType, categories });
    return Response.json({ receipt }, { headers });
  } catch (error) {
    const code = error instanceof Error ? error.message : "RECEIPT_SCAN_FAILED";
    if (code === "AI_DAILY_LIMIT") return Response.json({ error: "Limite diário de leitura de cupons atingido" }, { status: 429, headers });
    if (code === "AI_RATE_LIMITED") return Response.json({ error: "A leitura está muito ocupada. Tente novamente em instantes." }, { status: 429, headers });
    if (code === "AI_TIMEOUT") return Response.json({ error: "A leitura demorou demais. Tente fotografar novamente." }, { status: 504, headers });
    console.error("[fluxo:receipt-ocr]", { code });
    return Response.json({ error: "Não consegui interpretar este cupom" }, { status: 502, headers });
  }
}
