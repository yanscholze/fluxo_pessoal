import { requireUser } from "../../../../../server/auth/session.ts";
import { handle, json } from "../../../../../server/http/respond.ts";
import { readFinancialAnalysis, runFinancialAnalysis } from "../../../../../server/services/ai/analysis.ts";

export const dynamic = "force-dynamic";
/** Polling this endpoint is cheap and never schedules or generates work. */
export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await readFinancialAnalysis(user.id) });
});
/** Only this explicit action (or cron) can regenerate an automatic analysis. */
export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await runFinancialAnalysis(user.id, new Date(), { allowProvider: true }) });
});
