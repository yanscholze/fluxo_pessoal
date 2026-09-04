/**
 * `PATCH /api/v1/projects/:id` — edita a ficha do projeto.
 *
 * Aceita qualquer subconjunto dos campos. Campo ausente fica como está; campo
 * enviado vazio é **limpo** — apagar um link que mudou é uma edição legítima, e
 * tratar vazio como "não mexe" a tornaria impossível.
 *
 * Não existe campo de senha, e isso é deliberado: `credentialsHint` guarda
 * **onde** a credencial está, não a credencial. Senha em texto no banco
 * transformaria um vazamento do Fluxo num vazamento de todos os projetos.
 */

import { fromHours, type Milli } from "../../../../../core/domain/work/hours.ts";
import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { updateProject, updateProjectStatus } from "../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

const SITUACOES = [
  "lead",
  "proposal",
  "active",
  "waiting_client",
  "paused",
  "delivered",
  "support",
  "done",
  "cancelled",
] as const;

const PRIORIDADES = ["low", "normal", "high", "urgent"] as const;

/** Campos de texto livre, com o limite que cada um comporta. */
const TEXTOS = {
  description: 2000,
  repositoryUrl: 300,
  mainBranch: 80,
  productionUrl: 300,
  documentationUrl: 300,
  infraUrl: 300,
  adminUrl: 300,
  adminUser: 120,
  credentialsHint: 200,
  notes: 4000,
} as const;

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const projectId = segmentAfter(request, "projects");
  const input = read(await readJson(request));

  const campos: Record<string, string | null> = {};
  for (const [nome, max] of Object.entries(TEXTOS)) {
    // `optionalString` devolve `null` tanto para ausente quanto para vazio; o
    // que distingue os dois é a presença da chave no corpo enviado.
    if (!input.provided(nome)) continue;
    campos[nome] = input.optionalString(nome, { max });
  }

  const horas = input.optionalInteger("estimatedHours", { min: 0, max: 100_000 });
  const status = input.optionalChoice("status", SITUACOES);

  const payload = {
    ...campos,
    name: input.optionalString("name", { max: 120 }) ?? undefined,
    clientId: input.optionalReference("clientId") ?? undefined,
    priority: input.optionalChoice("priority", PRIORIDADES) ?? undefined,
    startsOn: input.optionalDate("startsOn") ?? undefined,
    dueOn: input.optionalDate("dueOn") ?? undefined,
    contract: input.optionalMoney("contract") ?? undefined,
    hourlyRate: input.optionalMoney("hourlyRate") ?? undefined,
    estimatedHours: horas === null ? undefined : (fromHours(horas) as Milli),
    color: input.optionalString("color", { max: 9 }) ?? undefined,
  };

  input.done();

  await updateProject(user.id, projectId, payload);

  // A situação passa pelo serviço próprio: ela carimba a entrega e escreve no
  // histórico, coisas que uma edição de campo não faz.
  if (status) await updateProjectStatus(user.id, projectId, status);

  return json({ data: { ok: true } });
});
