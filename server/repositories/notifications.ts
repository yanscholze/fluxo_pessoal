import { and, asc, count, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";

import { newId } from "../../core/kernel/id.ts";
import { getDatabase } from "../db/client.ts";
import { notifications } from "../db/schema/notifications.ts";
import { captureEvents } from "../db/schema/capture.ts";
import { invoices, transactions } from "../db/schema/ledger.ts";

export type NotificationCategory = typeof notifications.$inferSelect.category;
export type NotificationSource = "rule" | "analysis";
export type NotificationDraft = {
  readonly key: string;
  readonly category: NotificationCategory;
  readonly priority: number;
  readonly title: string;
  readonly body: string;
  readonly screen: string;
  readonly href: string;
  readonly askPrompt: string;
  readonly facts: Readonly<Record<string, unknown>>;
};
export type NotificationRecord = typeof notifications.$inferSelect;

/** O lote mantém atualização e resolução juntas; leituras simultâneas não criam duplicatas. */
export async function reconcileNotifications(userId: string, source: NotificationSource, drafts: readonly NotificationDraft[], now: Date): Promise<void> {
  const database = getDatabase();
  const instant = now.toISOString();
  const unique = [...new Map(drafts.map((item) => [item.key, item])).values()];
  const writes = unique.map((item) => database.insert(notifications).values({
    id: newId(), userId, eventKey: item.key, source,
    category: item.category, priority: item.priority, title: item.title, body: item.body,
    screen: item.screen, href: item.href, askPrompt: item.askPrompt,
    factsJson: JSON.stringify(item.facts), createdAt: instant, updatedAt: instant,
  }).onConflictDoUpdate({
    target: [notifications.userId, notifications.eventKey],
    set: {
      source, category: item.category, priority: item.priority, title: item.title, body: item.body,
      screen: item.screen, href: item.href, askPrompt: item.askPrompt, factsJson: JSON.stringify(item.facts),
      readAt: sql`CASE WHEN ${item.priority} > ${notifications.priority} THEN NULL ELSE ${notifications.readAt} END`,
      revision: sql`CASE WHEN ${item.priority} > ${notifications.priority} OR ${notifications.resolvedAt} IS NOT NULL THEN ${notifications.revision} + 1 ELSE ${notifications.revision} END`,
      resolvedAt: null, updatedAt: instant,
    },
    setWhere: sql`${notifications.updatedAt} <= ${instant} AND (${notifications.category} != ${item.category} OR ${notifications.priority} != ${item.priority}
      OR ${notifications.title} != ${item.title} OR ${notifications.body} != ${item.body}
      OR ${notifications.href} != ${item.href} OR ${notifications.askPrompt} != ${item.askPrompt}
      OR ${notifications.factsJson} != ${JSON.stringify(item.facts)} OR ${notifications.resolvedAt} IS NOT NULL)`,
  }));
  const active = await database.select({ id: notifications.id, key: notifications.eventKey }).from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.source, source), isNull(notifications.resolvedAt)));
  const keys = new Set(unique.map((item) => item.key));
  const missing = active.filter((item) => !keys.has(item.key)).map((item) => item.id);
  const resolves = [];
  // D1 limita parâmetros por statement: uma conta com muitos compromissos continua válida.
  for (let offset = 0; offset < missing.length; offset += 80) {
    resolves.push(database.update(notifications).set({ resolvedAt: instant, updatedAt: instant })
      .where(and(eq(notifications.userId, userId), inArray(notifications.id, missing.slice(offset, offset + 80)), lte(notifications.updatedAt, instant))));
  }
  const statements = [...writes, ...resolves];
  if (statements.length) await database.batch(statements as never);
}

export async function readNotifications(userId: string): Promise<{ rows: NotificationRecord[]; unreadCount: number }> {
  const database = getDatabase();
  // Active unread events must remain reachable even after reading the first 100.
  const [rows, unread] = await Promise.all([
    database.select().from(notifications).where(eq(notifications.userId, userId))
      .orderBy(sql`${notifications.resolvedAt} IS NOT NULL`, sql`${notifications.readAt} IS NOT NULL`, desc(notifications.priority), desc(notifications.updatedAt)).limit(100),
    database.select({ total: count() }).from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.resolvedAt), isNull(notifications.readAt))),
  ]);
  return { rows, unreadCount: unread[0]?.total ?? 0 };
}

export async function findNotificationForUser(userId: string, id: string): Promise<NotificationRecord | null> {
  const [row] = await getDatabase().select().from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.id, id))).limit(1);
  return row ?? null;
}

export async function markNotificationsRead(userId: string, ids: readonly string[] | "all", now = new Date()): Promise<void> {
  if (ids !== "all" && ids.length === 0) return;
  await getDatabase().update(notifications).set({ readAt: now.toISOString() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt),
      ids === "all" ? isNull(notifications.resolvedAt) : inArray(notifications.id, [...ids])));
}

/** Todas as previsões relevantes, sem o limite da agenda e sem os textos crus de captura. */
export async function notificationRuleDetails(userId: string, horizon: string) {
  const database = getDatabase();
  const [invoiceDates, planned, pendingCount, oldest] = await Promise.all([
    database.select({ cardId: invoices.cardId, competence: invoices.competence, dueDate: invoices.dueDate })
      .from(invoices).where(eq(invoices.userId, userId)),
    database.select({ id: transactions.id, description: transactions.description, amountCents: transactions.amountCents,
      date: transactions.occurredOn, recurrenceId: transactions.recurrenceId, accountId: transactions.originAccountId,
      cardId: transactions.originCardId, installmentPlanId: transactions.installmentPlanId })
      .from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.state, "planned"),
        eq(transactions.kind, "expense"), isNull(transactions.deletedAt), lte(transactions.occurredOn, horizon))),
    database.select({ total: count() }).from(captureEvents)
      .where(and(eq(captureEvents.userId, userId), eq(captureEvents.status, "pendente"))),
    database.select({ id: captureEvents.id }).from(captureEvents)
      .where(and(eq(captureEvents.userId, userId), eq(captureEvents.status, "pendente")))
      .orderBy(asc(captureEvents.postedAt), asc(captureEvents.id)).limit(1),
  ]);
  return { invoiceDates, planned, pendingCaptures: pendingCount[0]?.total ?? 0, oldestCaptureId: oldest[0]?.id ?? null };
}
