/** Tokens por login. A resposta contém apenas estado, nunca o segredo. */
import { forbidden, validationError } from "../../../../core/kernel/errors.ts";
import { requireUser, type AuthenticatedUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import {
  chooseAiProvider, integrationStatus, removeIntegrationToken, saveIntegrationToken,
} from "../../../../server/services/integration-credentials.ts";
import type { AiProvider, IntegrationProvider } from "../../../../server/repositories/integrations.ts";

export const dynamic = "force-dynamic";

function writable(request: Request, user: AuthenticatedUser): void {
  if (user.sessionKind === "device") return;
  if (request.headers.get("origin") !== new URL(request.url).origin) throw forbidden("Origem não permitida.");
}

function provider(value: string): IntegrationProvider {
  if (value === "gemini" || value === "openai" || value === "github") return value;
  throw validationError("Provedor desconhecido", [{ path: "provider", message: "Escolha Gemini, OpenAI ou GitHub" }]);
}

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await integrationStatus(user.id) });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  writable(request, user);
  const input = read(await readJson(request));
  const chosen = provider(input.string("provider"));
  const token = input.string("token", { min: 8, max: 1000 });
  input.done();
  return json({ data: await saveIntegrationToken(user.id, chosen, token) });
});

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  writable(request, user);
  const input = read(await readJson(request));
  const chosen = input.string("provider");
  input.done();
  if (chosen !== "gemini" && chosen !== "openai") {
    throw validationError("Escolha um provedor de IA", [{ path: "provider", message: "Gemini ou OpenAI" }]);
  }
  return json({ data: await chooseAiProvider(user.id, chosen as AiProvider) });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  writable(request, user);
  const input = read(await readJson(request));
  const chosen = provider(input.string("provider"));
  input.done();
  return json({ data: await removeIntegrationToken(user.id, chosen) });
});
