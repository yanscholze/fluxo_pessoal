/** Scheduled card subscriptions only. Reads never materialize financial records. */
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { type Recurrence, appliesTo, matchesCapture, occurrenceAmount, occurrenceDate, occurrenceKey } from "../../core/domain/recurrence/schedule.ts";
import { conflict } from "../../core/kernel/errors.ts";
import { competenceOf, firstDay } from "../../core/time/competence.ts";
import { type LocalDate, addDays, daysBetween, todayIn } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import { captureEvents, cards, recurrences, subscriptionPostingCheckpoints, transactions, users } from "../db/schema/index.ts";
import { claimLease, releaseLease } from "../repositories/ai.ts";
import { listCards } from "../repositories/catalog.ts";
import { confirmedOccurrenceKeys, listRecurrences } from "../repositories/recurrences.ts";
import { confirmOccurrence, linkOccurrence } from "./recurrences.ts";

const MAX_OCCURRENCES = 10;
const MATCH_DAYS = 3;
const normalize = (value: string) => value.normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function sameService(description: string, rule: Pick<Recurrence, "description" | "captureMatch" | "captureIgnore">) {
  return normalize(description) === normalize(rule.description) || matchesCapture(rule, description) === "pagamento";
}

export type PostingResult = { created: number; linked: number; skipped: number };

/**
 * An imported bank charge can reuse a scheduled record, but never by a fuzzy
 * merchant guess. Card, date and service must match uniquely. A price change
 * needs review rather than silently duplicating or overwriting a charge.
 */
type SubscriptionCharge = {
  cardId: string; description: string; amountCents: number; occurredOn: LocalDate;
};

/** Resolve a bank batch in one read rather than a query per imported line. */
export async function findPostedSubscriptionCharges(userId: string, charges: readonly SubscriptionCharge[]): Promise<(string | null)[]> {
  if (!charges.length) return [];
  const dates = charges.map((charge) => charge.occurredOn).sort();
  const rows = await getDatabase().select({ id: transactions.id, description: transactions.description,
    amountCents: transactions.amountCents, ruleDescription: sql<string>`${recurrences.description}`.as("rule_description"),
    cardId: transactions.originCardId, occurredOn: transactions.occurredOn,
    captureMatch: recurrences.captureMatch, captureIgnore: recurrences.captureIgnore })
    .from(transactions).leftJoin(recurrences, and(eq(recurrences.id, transactions.recurrenceId), eq(recurrences.userId, userId)))
    .where(and(eq(transactions.userId, userId), eq(transactions.kind, "expense"), eq(transactions.state, "confirmed"),
      isNotNull(transactions.recurrenceId), or(eq(recurrences.role, "subscription"), isNull(recurrences.id)),
      inArray(transactions.originCardId, [...new Set(charges.map((charge) => charge.cardId))]), isNull(transactions.deletedAt),
      gte(transactions.occurredOn, addDays(dates[0], -MATCH_DAYS)), lte(transactions.occurredOn, addDays(dates.at(-1)!, MATCH_DAYS))));
  return charges.map((charge) => {
    const matches = rows.filter((row) => row.cardId === charge.cardId
      && Math.abs(daysBetween(charge.occurredOn, row.occurredOn as LocalDate)) <= MATCH_DAYS
      && (normalize(row.description) === normalize(charge.description) || sameService(charge.description, {
        description: row.ruleDescription ?? row.description, captureMatch: row.captureMatch, captureIgnore: row.captureIgnore,
      })));
    if (!matches.length) return null;
    if (matches.length !== 1 || matches[0].amountCents !== Math.abs(charge.amountCents)) {
      throw conflict("Já existe cobrança de assinatura no cartão com valor diferente ou mais de um candidato. Confira os lançamentos antes de confirmar esta linha.");
    }
    return matches[0].id;
  });
}

export async function findPostedSubscriptionCharge(userId: string, charge: SubscriptionCharge): Promise<string | null> {
  return (await findPostedSubscriptionCharges(userId, [charge]))[0];
}

/** Current month only: enabling this feature never invents historical charges. */
export async function postDueCardSubscriptions(userId: string, now = new Date()): Promise<PostingResult> {
  const result: PostingResult = { created: 0, linked: 0, skipped: 0 };
  const lease = await claimLease(userId, "card-subscriptions", now);
  if (!lease) return { ...result, skipped: 1 };
  const database = getDatabase();
  let lastRuleId: string | null = null;
  try {
    const today = todayIn(now);
    const competence = competenceOf(today);
    const [rules, cardList, confirmedKeys, [checkpoint]] = await Promise.all([
      listRecurrences(userId, true), listCards(userId), confirmedOccurrenceKeys(userId),
      database.select().from(subscriptionPostingCheckpoints).where(eq(subscriptionPostingCheckpoints.userId, userId)).limit(1),
    ]);
    const creditIds = new Set(cardList.filter((card) => card.kind === "credit").map((card) => card.id));
    const due = rules.filter((rule) => rule.role === "subscription" && rule.kind === "expense" && rule.cardId && creditIds.has(rule.cardId)
      && appliesTo(rule, competence) && occurrenceDate(rule, competence) <= today && !confirmedKeys.has(occurrenceKey(rule.id, competence)))
      .sort((a, b) => a.id.localeCompare(b.id));
    const cursor = checkpoint?.lastRuleId;
    const ordered = cursor ? [...due.filter((rule) => rule.id > cursor), ...due.filter((rule) => rule.id <= cursor)] : due;
    const batch = ordered.slice(0, MAX_OCCURRENCES);
    lastRuleId = batch.at(-1)?.id ?? checkpoint?.lastRuleId ?? null;
    const cardIds = [...new Set(batch.map((rule) => rule.cardId!))];
    const candidates = cardIds.length ? await database.select({ id: transactions.id, description: transactions.description,
      amountCents: transactions.amountCents, occurredOn: transactions.occurredOn, cardId: transactions.originCardId })
      .from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.kind, "expense"),
        eq(transactions.state, "confirmed"), isNull(transactions.deletedAt), isNull(transactions.recurrenceId),
        isNull(transactions.installmentPlanId), isNull(transactions.installmentNumber), inArray(transactions.originCardId, cardIds),
        gte(transactions.occurredOn, addDays(firstDay(competence), -MATCH_DAYS)), lte(transactions.occurredOn, addDays(today, MATCH_DAYS)),
        sql`NOT EXISTS (SELECT 1 FROM recurrence_runs WHERE transaction_id = ${transactions.id})`)) : [];
    const used = new Set<string>();
    const recognized = batch.length ? await database.select({ recurrenceId: captureEvents.subscriptionId,
      amountCents: captureEvents.amountCents, occurredOn: captureEvents.occurredOn })
      .from(captureEvents).where(and(eq(captureEvents.userId, userId), eq(captureEvents.status, "assinatura"),
        isNull(captureEvents.transactionId), inArray(captureEvents.subscriptionId, batch.map((rule) => rule.id)),
        gte(captureEvents.occurredOn, addDays(firstDay(competence), -MATCH_DAYS)), lte(captureEvents.occurredOn, today))) : [];
    // Keep financial writes sequential: the next rule must see which candidate
    // this batch already consumed, rather than racing to link the same charge.
    for (const rule of batch) {
      const date = occurrenceDate(rule, competence);
      // Recognition is intentionally looser than posting. A recorded price
      // discrepancy is grounds for review, never permission to guess a value.
      if (recognized.some((item) => item.recurrenceId === rule.id
        && Math.abs(daysBetween(date, item.occurredOn as LocalDate)) <= MATCH_DAYS
        && item.amountCents !== occurrenceAmount(rule, competence))) { result.skipped++; continue; }
      const named = candidates.filter((item) => !used.has(item.id) && item.cardId === rule.cardId
        && Math.abs(daysBetween(date, item.occurredOn as LocalDate)) <= MATCH_DAYS && sameService(item.description, rule));
      if (named.length) {
        const item = named[0];
        if (named.length !== 1 || item.amountCents !== occurrenceAmount(rule, competence) || item.occurredOn > today) { result.skipped++; continue; }
        const linked = await linkOccurrence(userId, rule.id, competence, item.id, now);
        used.add(item.id);
        if (!linked.alreadyConfirmed) result.linked++;
      } else {
        const posted = await confirmOccurrence(userId, rule.id, competence, {}, now);
        if (!posted.alreadyConfirmed) result.created++;
      }
    }
    return result;
  } finally {
    try {
      await database.insert(subscriptionPostingCheckpoints).values({ userId, checkedAt: now.toISOString(), lastRuleId })
        .onConflictDoUpdate({ target: subscriptionPostingCheckpoints.userId, set: { checkedAt: now.toISOString(), lastRuleId } });
    } finally { await releaseLease(lease); }
  }
}

/** One account per tick, fairly rotated; independent of AI configuration/failure. */
export async function runScheduledCardSubscriptions(now = new Date()) {
  const [owner] = await getDatabase().selectDistinct({ id: users.id }).from(users)
    .innerJoin(recurrences, and(eq(recurrences.userId, users.id), eq(recurrences.role, "subscription"), eq(recurrences.isActive, true)))
    .innerJoin(cards, and(eq(cards.id, recurrences.cardId), eq(cards.userId, users.id), eq(cards.kind, "credit"), isNull(cards.archivedAt)))
    .leftJoin(subscriptionPostingCheckpoints, eq(subscriptionPostingCheckpoints.userId, users.id))
    .orderBy(asc(subscriptionPostingCheckpoints.checkedAt), asc(users.id)).limit(1);
  const result = { processed: 0, created: 0, linked: 0, skipped: 0, failed: 0 };
  if (!owner) return result;
  result.processed = 1;
  try { Object.assign(result, await postDueCardSubscriptions(owner.id, now)); }
  catch { result.failed = 1; }
  return result;
}
