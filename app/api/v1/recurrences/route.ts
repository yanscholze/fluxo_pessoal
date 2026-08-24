/**
 * `GET /api/v1/recurrences` — regras cadastradas e a próxima ocorrência de cada.
 * `POST /api/v1/recurrences` — cadastra uma regra.
 *
 * Criar a regra não grava lançamento: a projeção é derivada dela a cada
 * consulta. Só a confirmação vira linha no banco.
 */

import { nextOccurrence } from "../../../../core/domain/recurrence/schedule.ts";
import { todayIn } from "../../../../core/time/local-date.ts";
import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { listRecurrences } from "../../../../server/repositories/recurrences.ts";
import { createRecurrence } from "../../../../server/services/recurrences.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const rules = await listRecurrences(user.id);
  const hoje = todayIn();

  return json({
    data: rules.map((rule) => {
      const proxima = nextOccurrence(rule, hoje);
      return {
        id: rule.id,
        role: rule.role,
        kind: rule.kind,
        description: rule.description,
        categoryId: rule.categoryId,
        accountId: rule.accountId,
        cardId: rule.cardId,
        amountCents: rule.amount,
        amountMode: rule.amountMode,
        scheduleMode: rule.scheduleMode,
        scheduleDay: rule.scheduleDay,
        interval: rule.interval,
        isActive: rule.isActive,
        next: proxima ? { competence: proxima.competence, date: proxima.date, amountCents: proxima.amount } : null,
      };
    }),
  });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const payload = {
    role: input.optionalChoice("role", ["standard", "salary", "benefit", "subscription"] as const) ?? "standard",
    kind: input.choice("kind", ["expense", "income", "transfer"] as const),
    description: input.string("description", { max: 160 }),
    amount: input.money("amount"),
    amountMode: input.optionalChoice("amountMode", ["fixed", "per_business_day"] as const) ?? "fixed",
    scheduleMode:
      input.optionalChoice("scheduleMode", ["day_of_month", "business_day_of_month"] as const) ?? "day_of_month",
    scheduleDay: input.integer("scheduleDay", { min: 1, max: 31 }),
    dayAdjustment: input.optionalChoice("dayAdjustment", ["previous", "next"] as const) ?? "next",
    interval: input.optionalChoice("interval", ["monthly", "yearly"] as const) ?? "monthly",
    categoryId: input.optionalReference("categoryId"),
    accountId: input.optionalReference("accountId"),
    cardId: input.optionalReference("cardId"),
    destinationAccountId: input.optionalReference("destinationAccountId"),
    startsOn: input.optionalDate("startsOn"),
    endsOn: input.optionalDate("endsOn"),
  };

  input.done();

  const id = await createRecurrence(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
