import { and, count, eq } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import { captureEvents, importBatches } from "../db/schema/index.ts";

export type TarsPendingCounts = {
  readonly captures: number;
  readonly imports: number;
};

/**
 * Contagens completas da fila, sem carregar os textos de notificações nem os
 * extratos. As listas de revisão têm limites de paginação; contar essas listas
 * na home esconderia pendências antigas de quem tem muitos registros.
 */
export async function readTarsPendingCounts(userId: string): Promise<TarsPendingCounts> {
  const database = getDatabase();
  const [captures, imports] = await Promise.all([
    database
      .select({ total: count() })
      .from(captureEvents)
      .where(and(eq(captureEvents.userId, userId), eq(captureEvents.status, "pendente"))),
    database
      .select({ total: count() })
      .from(importBatches)
      .where(and(eq(importBatches.userId, userId), eq(importBatches.status, "review"))),
  ]);

  return { captures: captures[0]?.total ?? 0, imports: imports[0]?.total ?? 0 };
}
