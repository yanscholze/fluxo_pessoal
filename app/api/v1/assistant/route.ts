import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { deleteConversation } from "../../../../server/repositories/ai.ts";
import { askCoach } from "../../../../server/services/ai/coach.ts";
import { buildAssistantState } from "../../../../server/services/ai/assistant-state.ts";

export const dynamic = "force-dynamic";
export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const params = new URL(request.url).searchParams;
  return json({ data: await buildAssistantState(user.id, {
    conversationId: params.get("conversationId") ?? undefined, notificationId: params.get("notificationId") ?? undefined,
  }) });
});
export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));
  const question = input.string("question", { min: 3, max: 500 });
  const conversationId = input.optionalReference("conversationId") ?? undefined;
  const notificationId = input.optionalReference("notificationId") ?? undefined;
  input.done();
  const { advice, remaining, conversationId: id } = await askCoach(user.id, { question, conversationId, notificationId });
  return json({ data: { ...advice, remaining, conversationId: id } });
});
export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));
  const conversationId = input.string("conversationId", { max: 64 }); input.done();
  await deleteConversation(user.id, conversationId);
  return json({ data: { deleted: true } });
});
