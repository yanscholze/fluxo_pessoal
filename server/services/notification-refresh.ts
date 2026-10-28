/** Deterministic alerts refresh separately from AI and NEVER during notification reads. */
import { eq } from "drizzle-orm";
import { todayIn } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { notificationCheckpoints } from "../db/schema/notification-checkpoints.ts";
import { claimLease, financialRevision, releaseLease } from "../repositories/ai.ts";
import { syncEssentialNotifications } from "./notifications.ts";

export async function refreshEssentialNotifications(userId: string, now = new Date()): Promise<boolean> {
  const db = getDatabase();
  const revision = await financialRevision(userId);
  const day = todayIn(now);
  const [previous] = await db.select().from(notificationCheckpoints).where(eq(notificationCheckpoints.userId, userId)).limit(1);
  if (previous?.sourceRevision === revision && previous.checkedDay === day) return false;
  const lease = await claimLease(userId, "notifications", now);
  if (!lease) return false;
  try {
    const [latest] = await db.select().from(notificationCheckpoints).where(eq(notificationCheckpoints.userId, userId)).limit(1);
    if (latest?.sourceRevision === revision && latest.checkedDay === day) return false;
    await syncEssentialNotifications(userId, now);
    // A concurrent financial write must leave the checkpoint dirty for the next run.
    if (await financialRevision(userId) === revision) {
      const value = { userId, sourceRevision: revision, checkedDay: day, checkedAt: now.toISOString() };
      await db.insert(notificationCheckpoints).values(value).onConflictDoUpdate({ target: notificationCheckpoints.userId, set: value });
    }
    return true;
  } finally { await releaseLease(lease); }
}
