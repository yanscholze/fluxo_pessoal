/**
 * `GET  /api/v1/projects` — panorama dos projetos, já avaliados.
 * `POST /api/v1/projects` — cria um projeto.
 *
 * Rota fina: indicadores vêm prontos do serviço, calculados pelo domínio. O
 * cliente exibe — não recalcula prazo, recebido nem valor/hora efetivo.
 */

import { PROJECT_STATUSES } from "../../../../core/domain/work/status.ts";
import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { fromHours, type Milli } from "../../../../core/domain/work/hours.ts";
import { buildWorkOverview, createProject } from "../../../../server/services/work.ts";

export const dynamic = "force-dynamic";


const PRIORIDADES = ["low", "normal", "high", "urgent"] as const;

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const view = await buildWorkOverview(user.id);

  return json({
    data: {
      today: view.today,
      totals: view.totals,
      projects: view.projects.map((projeto) => ({
        id: projeto.id,
        name: projeto.name,
        clientName: projeto.clientName,
        status: projeto.status,
        priority: projeto.priority,
        color: projeto.color,
        dueOn: projeto.dueOn,
        openTasks: projeto.openTasks,
        contractedCents: projeto.health.finance.contracted,
        receivedCents: projeto.health.finance.received,
        pendingCents: projeto.health.finance.pending,
        overdueCents: projeto.health.finance.overdue,
        percentReceived: projeto.health.finance.percentReceived,
        workedMilli: projeto.health.effort.worked,
        estimatedMilli: projeto.health.effort.estimated,
        overrun: projeto.health.effort.overrun,
        effectiveRateCents: projeto.health.effort.effectiveRate,
        deadlineStatus: projeto.health.deadline.status,
        daysLeft: projeto.health.deadline.daysLeft,
      })),
    },
  });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const horas = input.optionalInteger("estimatedHours", { min: 0, max: 100_000 });

  const payload = {
    name: input.string("name", { max: 120 }),
    clientId: input.optionalReference("clientId"),
    description: input.optionalString("description", { max: 2000 }),
    status: input.optionalChoice("status", PROJECT_STATUSES) ?? undefined,
    priority: input.optionalChoice("priority", PRIORIDADES) ?? undefined,
    startsOn: input.optionalDate("startsOn"),
    dueOn: input.optionalDate("dueOn"),
    contract: input.optionalMoney("contract"),
    hourlyRate: input.optionalMoney("hourlyRate"),
    estimatedHours: horas === null ? null : (fromHours(horas) as Milli),
    repositoryUrl: input.optionalString("repositoryUrl", { max: 300 }),
    productionUrl: input.optionalString("productionUrl", { max: 300 }),
    documentationUrl: input.optionalString("documentationUrl", { max: 300 }),
    mainBranch: input.optionalString("mainBranch", { max: 80 }),
    notes: input.optionalString("notes", { max: 2000 }),
    color: input.optionalString("color", { max: 9 }),
  };
  input.done();

  const id = await createProject(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
