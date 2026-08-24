/**
 * `GET  /api/v1/assistant` — cota restante e se o assistente está configurado.
 * `POST /api/v1/assistant` — pergunta ao assistente sobre a própria situação.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { askCoach } from "../../../../server/services/ai/coach.ts";
import { isConfigured } from "../../../../server/services/ai/client.ts";
import { quotaStatus } from "../../../../server/services/ai/quota.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const [advice, receipt] = await Promise.all([
    quotaStatus(user.id, "advice"),
    quotaStatus(user.id, "receipt"),
  ]);

  return json({ data: { configured: isConfigured(), advice, receipt } });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const question = input.string("question", { min: 3, max: 500 });
  input.done();

  const { advice, remaining } = await askCoach(user.id, { question });
  return json({ data: { ...advice, remaining } });
});
