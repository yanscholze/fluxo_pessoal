/** Leitura do detalhe e edição parcial da ficha do projeto. */

import { PROJECT_STATUSES } from "../../../../../core/domain/work/status.ts";
import { fromHours, type Milli } from "../../../../../core/domain/work/hours.ts";
import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { buildProjectDetail, updateProject, updateProjectStatus } from "../../../../../server/services/work.ts";

export const dynamic = "force-dynamic";
const PRIORIDADES = ["low", "normal", "high", "urgent"] as const;
const TEXTOS = { description: 2000, repositoryUrl: 300, mainBranch: 80, productionUrl: 300, documentationUrl: 300, infraUrl: 300, adminUrl: 300, adminUser: 120, credentialsHint: 200, notes: 4000 } as const;

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await buildProjectDetail(user.id, segmentAfter(request, "projects")) });
});

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const projectId = segmentAfter(request, "projects");
  const input = read(await readJson(request));
  const campos: Record<string, string | null> = {};
  for (const [nome, max] of Object.entries(TEXTOS)) {
    if (!input.provided(nome)) continue;
    campos[nome] = input.optionalString(nome, { max });
  }
  const horas = input.optionalInteger("estimatedHours", { min: 0, max: 100_000 });
  const status = input.optionalChoice("status", PROJECT_STATUSES);
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
  if (status) await updateProjectStatus(user.id, projectId, status);
  return json({ data: { ok: true } });
});
