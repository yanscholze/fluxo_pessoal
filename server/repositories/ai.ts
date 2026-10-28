import { and, asc, desc, eq, getTableColumns, inArray, lt } from "drizzle-orm";
import { newId } from "../../core/kernel/id.ts";
import { DomainError } from "../../core/kernel/errors.ts";
import { getDatabase } from "../db/client.ts";
import { aiAnalyses, aiConversations, aiLeases, aiMessages, financialRevisions } from "../db/schema/ai-conversations.ts";
import { users } from "../db/schema/identity.ts";
import type { Advice } from "../services/ai/coach.ts";

export async function listConversations(userId: string) {
  return getDatabase().select({ id: aiConversations.id, title: aiConversations.title, updatedAt: aiConversations.updatedAt })
    .from(aiConversations).where(eq(aiConversations.userId, userId)).orderBy(desc(aiConversations.updatedAt)).limit(30);
}
export async function loadConversation(userId: string, id: string) {
  const [conversation] = await getDatabase().select().from(aiConversations)
    .where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId))).limit(1);
  if (!conversation) throw new DomainError("not_found", "Conversa não encontrada.");
  const rows = await getDatabase().select().from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(desc(aiMessages.sequence)).limit(100);
  return { ...conversation, messages: rows.reverse().map(({ adviceJson, ...row }) => ({ ...row, ...(adviceJson ? { advice: JSON.parse(adviceJson) as Advice } : {}) })) };
}
/** Pair is atomic; a provider failure never leaves a false answer in history. */
export async function appendTurn(userId: string, conversationId: string | undefined, question: string, advice: Advice, now: Date): Promise<string> {
  const db = getDatabase();
  if (conversationId) await loadConversation(userId, conversationId);
  const id = conversationId ?? newId();
  const at = now.toISOString();
  const conversation = conversationId
    ? db.update(aiConversations).set({ updatedAt: at }).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)))
    : db.insert(aiConversations).values({ id, userId, title: question.slice(0, 80), createdAt: at, updatedAt: at });
  const [latest] = await db.select({ sequence: aiMessages.sequence }).from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(desc(aiMessages.sequence)).limit(1);
  const sequence = (latest?.sequence ?? 0) + 1;
  await db.batch([conversation,
    db.insert(aiMessages).values({ id: newId(), conversationId: id, role: "user", sequence, content: question, createdAt: at }),
    db.insert(aiMessages).values({ id: newId(), conversationId: id, role: "assistant", sequence: sequence + 1, content: advice.answer, adviceJson: JSON.stringify(advice), createdAt: at }),
  ] as never);
  const older = await db.select({ id: aiMessages.id }).from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(desc(aiMessages.sequence)).limit(1000).offset(100);
  if (older.length) await db.delete(aiMessages).where(inArray(aiMessages.id, older.map((m) => m.id)));
  return id;
}
export async function deleteConversation(userId: string, id: string): Promise<void> {
  await loadConversation(userId, id);
  await getDatabase().delete(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));
}
export async function claimLease(userId: string, scope: string, now: Date): Promise<string | null> {
  const id = newId();
  const result = await getDatabase().insert(aiLeases).values({ id, userId, scope, expiresAt: now.getTime() + 90_000 })
    .onConflictDoUpdate({ target: [aiLeases.userId, aiLeases.scope], set: { id, expiresAt: now.getTime() + 90_000 }, setWhere: lt(aiLeases.expiresAt, now.getTime()) }).returning({ id: aiLeases.id });
  return result[0]?.id === id ? id : null;
}
export async function releaseLease(id: string): Promise<void> { await getDatabase().delete(aiLeases).where(eq(aiLeases.id, id)); }
export async function cachedAnalysis(userId: string) {
  const [row] = await getDatabase().select().from(aiAnalyses).where(eq(aiAnalyses.userId, userId)).limit(1);
  return row ?? null;
}
/** Polling must not transfer the potentially much larger chat snapshot from D1. */
export async function cachedAnalysisView(userId: string) {
  const { contextJson, ...columns } = getTableColumns(aiAnalyses);
  void contextJson;
  const [row] = await getDatabase().select(columns).from(aiAnalyses).where(eq(aiAnalyses.userId, userId)).limit(1);
  return row ?? null;
}
export async function saveAnalysis(value: typeof aiAnalyses.$inferInsert): Promise<void> {
  await getDatabase().insert(aiAnalyses).values(value).onConflictDoUpdate({ target: aiAnalyses.userId, set: value });
}
export async function financialRevision(userId: string): Promise<number> {
  const [row] = await getDatabase().select({ revision: financialRevisions.revision }).from(financialRevisions)
    .where(eq(financialRevisions.userId, userId)).limit(1);
  return row?.revision ?? 0;
}
export async function analysisInProgress(userId: string, now: Date): Promise<boolean> {
  const [row] = await getDatabase().select({ expiresAt: aiLeases.expiresAt }).from(aiLeases)
    .where(and(eq(aiLeases.userId, userId), eq(aiLeases.scope, "analysis"))).limit(1);
  return !!row && row.expiresAt > now.getTime();
}
export async function patchAnalysis(userId: string, values: Partial<typeof aiAnalyses.$inferInsert>): Promise<void> {
  await getDatabase().update(aiAnalyses).set(values).where(eq(aiAnalyses.userId, userId));
}
export async function analysisUsers(limit = 20): Promise<string[]> {
  const rows = await getDatabase().select({ id: users.id }).from(users).leftJoin(aiAnalyses, eq(users.id, aiAnalyses.userId))
    .orderBy(asc(aiAnalyses.checkedAt), asc(users.id)).limit(limit);
  return rows.map((row) => row.id);
}
