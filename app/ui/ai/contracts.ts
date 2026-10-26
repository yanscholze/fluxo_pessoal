/** Presentation contracts shared by the chat and notification centre. No secrets. */
export type AiAdvice = {
  answer: string;
  summary: string;
  actions: readonly { label: string; reason: string; priority: "alta" | "media" | "baixa" }[];
  warnings: readonly string[];
};
export type AiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  advice?: Pick<AiAdvice, "summary" | "actions" | "warnings">;
};
export type FinancialInsight = {
  key: string;
  category: "critical" | "attention" | "insight" | "opportunity" | "reminder";
  priority: number;
  title: string;
  body: string;
  href: string;
  question: string;
};
export type AssistantState = {
  configured: boolean;
  advice: { remaining: number; limit: number };
  receipt: { remaining: number; limit: number };
  suggestions?: readonly string[];
  insights?: readonly FinancialInsight[];
  conversations?: readonly { id: string; title: string; updatedAt: string }[];
  conversation?: { id: string; messages: readonly AiMessage[] } | null;
  notificationPrompt?: string;
};
export type NotificationItem = {
  id: string;
  key: string;
  severity: "urgente" | "atencao" | "informativo";
  category: FinancialInsight["category"];
  priority: number;
  title: string;
  body: string;
  screen: string;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  resolvedAt: string | null;
  href: string;
  askPrompt: string | null;
  source: string;
  revision?: number;
};
export type NotificationsState = { today: string; alerts: readonly NotificationItem[]; unreadCount: number; history?: readonly NotificationItem[] };
