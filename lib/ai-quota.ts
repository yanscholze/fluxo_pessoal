import { env } from "cloudflare:workers";
import { ensureFinanceSchema } from "../db/ensure-schema";

function quotaId(ownerId: string, feature: string, day: string) {
  return `${ownerId}:${feature}:${day}`;
}

export async function consumeAiQuota(ownerId: string, feature: "receipt-ocr" | "financial-advice", dailyLimit: number) {
  await ensureFinanceSchema();
  const day = new Date().toISOString().slice(0, 10);
  const id = quotaId(ownerId, feature, day);
  await env.DB.prepare(`INSERT INTO ai_usage_daily (id, owner_id, feature, usage_day, request_count, updated_at)
    VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO NOTHING`)
    .bind(id, ownerId, feature, day).run();
  const increment = await env.DB.prepare(`UPDATE ai_usage_daily
    SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND request_count < ?`)
    .bind(id, dailyLimit).run();
  if ((increment.meta?.changes ?? 0) === 0) throw new Error("AI_DAILY_LIMIT");
}
