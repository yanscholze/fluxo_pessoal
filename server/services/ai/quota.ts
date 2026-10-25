/**
 * Cota diária da IA.
 *
 * Cada chamada custa dinheiro real. A contagem é por recurso para que um laço
 * com defeito no assistente não deixe o usuário sem a leitura de cupom.
 */

import { and, eq, sql } from "drizzle-orm";

import { rateLimited } from "../../../core/kernel/errors.ts";
import { newId } from "../../../core/kernel/id.ts";
import { todayIn } from "../../../core/time/local-date.ts";
import { getDatabase } from "../../db/client.ts";
import { aiUsage } from "../../db/schema/index.ts";

export type AiFeature = "advice" | "receipt" | "analysis";

export const DAILY_LIMIT: Record<AiFeature, number> = {
  advice: 60,
  receipt: 30,
  analysis: 4,
};

export type QuotaStatus = {
  readonly used: number;
  readonly limit: number;
  readonly remaining: number;
};

export async function quotaStatus(
  userId: string,
  feature: AiFeature,
  now: Date = new Date(),
): Promise<QuotaStatus> {
  const database = getDatabase();
  const dia = todayIn(now);

  const [linha] = await database
    .select({ count: aiUsage.requestCount })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.feature, feature), eq(aiUsage.usageDay, dia)))
    .limit(1);

  const usado = linha?.count ?? 0;
  const limite = DAILY_LIMIT[feature];
  return { used: usado, limit: limite, remaining: Math.max(0, limite - usado) };
}

/**
 * Consome uma unidade da cota, recusando quando esgotada.
 *
 * O incremento acontece **antes** da chamada ao modelo. Contar depois deixaria
 * uma falha do provedor sair de graça, e uma sequência de falhas viraria uma
 * sequência de cobranças.
 */
export async function consume(userId: string, feature: AiFeature, now: Date = new Date()): Promise<QuotaStatus> {
  const database = getDatabase();
  const dia = todayIn(now);
  const limite = DAILY_LIMIT[feature];
  const [consumed] = await database.insert(aiUsage)
    .values({ id: newId(now.getTime()), userId, feature, usageDay: dia, requestCount: 1 })
    .onConflictDoUpdate({
      target: [aiUsage.userId, aiUsage.feature, aiUsage.usageDay],
      set: { requestCount: sql`${aiUsage.requestCount} + 1`, updatedAt: now.toISOString() },
      setWhere: sql`${aiUsage.requestCount} < ${limite}`,
    }).returning({ used: aiUsage.requestCount });
  if (!consumed) {
    const amanha = new Date(now);
    amanha.setUTCHours(27, 0, 0, 0); // meia-noite em Brasília
    throw rateLimited(
      feature === "advice"
        ? "Você atingiu o limite de consultas ao assistente por hoje."
        : feature === "receipt" ? "Você atingiu o limite de leituras de cupom por hoje." : "O limite de análises automáticas de hoje foi atingido.",
      Math.max(60, Math.round((amanha.getTime() - now.getTime()) / 1000)),
    );
  }

  return { used: consumed.used, limit: limite, remaining: limite - consumed.used };
}
