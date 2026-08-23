import { and, eq } from "drizzle-orm";
import { appNotifications, pushSubscriptions } from "../db/schema";
import { getDb } from "../db";

type NotificationInput = { kind: "feedback-new" | "feedback-updated" | "system"; title: string; message: string; feedbackId?: string };

function clipped(value: string, limit: number) {
  const text = value.trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

async function sendExpoPush(ownerId: string, notificationId: string, input: NotificationInput) {
  const subscriptions = await getDb().select({ token: pushSubscriptions.expoPushToken }).from(pushSubscriptions).where(and(eq(pushSubscriptions.ownerId, ownerId), eq(pushSubscriptions.active, true)));
  if (!subscriptions.length) return;
  const messages = subscriptions.map(({ token }) => ({ to: token, title: clipped(input.title, 80), body: clipped(input.message, 180), sound: "default", priority: "high", channelId: "fluxo-updates", data: { view: "notifications", notificationId, feedbackId: input.feedbackId ?? null, kind: input.kind } }));
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify(messages) });
    if (!response.ok) console.error("[fluxo:push]", { status: response.status });
  } catch (error) { console.error("[fluxo:push]", { message: error instanceof Error ? error.message : String(error) }); }
}

export async function createAppNotification(ownerId: string, input: NotificationInput) {
  const id = crypto.randomUUID();
  await getDb().insert(appNotifications).values({ id, ownerId, kind: input.kind, title: clipped(input.title, 120), message: clipped(input.message, 600), feedbackId: input.feedbackId ?? null });
  await sendExpoPush(ownerId, id, input);
  return id;
}
