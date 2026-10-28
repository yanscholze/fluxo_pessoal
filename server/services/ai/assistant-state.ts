import { notFound } from "../../../core/kernel/errors.ts";
import { listConversations, loadConversation } from "../../repositories/ai.ts";
import { findNotificationForUser } from "../../repositories/notifications.ts";
import { readFinancialAnalysis } from "./analysis.ts";
import { isConfigured } from "./client.ts";
import { quotaStatus } from "./quota.ts";

/** Shared SSR/API state. Opening chat never calls a provider or marks a notification read. */
export async function buildAssistantState(userId: string, options: { conversationId?: string; notificationId?: string } = {}, now = new Date()) {
  const conversation = options.conversationId ? await loadConversation(userId, options.conversationId) : undefined;
  const notification = options.notificationId ? await findNotificationForUser(userId, options.notificationId) : null;
  if (options.notificationId && !notification) throw notFound("Notificação não encontrada.");
  const [advice, receipt, configured, conversations, analysis] = await Promise.all([
    quotaStatus(userId, "advice", now), quotaStatus(userId, "receipt", now), isConfigured(userId), listConversations(userId),
    readFinancialAnalysis(userId, now),
  ]);
  return { configured, advice, receipt, conversations, conversation, insights: analysis.insights.slice(0, 3),
    suggestions: analysis.suggestions, notificationPrompt: notification?.askPrompt,
    analysis: { state: analysis.state, generatedAt: analysis.generatedAt, status: analysis.status, stale: analysis.stale, updating: analysis.updating, lastError: analysis.lastError, retryAfter: analysis.retryAfter } };
}
