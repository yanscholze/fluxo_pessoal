/**
 * Leitura e escrita da área de trabalho.
 *
 * Toda consulta recebe o `userId` e filtra por ele — a mesma regra do resto do
 * Fluxo, e a que os testes de isolamento verificam. Nenhuma função daqui
 * calcula nada: elas trazem linhas, e o domínio decide o que significam.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import {
  clients,
  projectDeployments,
  projectEvents,
  projectPayments,
  projectTasks,
  projects,
  proposals,
  timeEntries,
} from "../db/schema/index.ts";

export type ClientRow = typeof clients.$inferSelect;
export type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof projectTasks.$inferSelect;
export type TimeEntryRow = typeof timeEntries.$inferSelect;
export type PaymentRow = typeof projectPayments.$inferSelect;
export type ProposalRow = typeof proposals.$inferSelect;
export type DeploymentRow = typeof projectDeployments.$inferSelect;
export type EventRow = typeof projectEvents.$inferSelect;

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export async function listClients(userId: string, includeArchived = false): Promise<ClientRow[]> {
  const database = getDatabase();
  const condicao = includeArchived
    ? eq(clients.userId, userId)
    : and(eq(clients.userId, userId), isNull(clients.archivedAt));

  return database.select().from(clients).where(condicao).orderBy(clients.name);
}

export async function findClient(userId: string, clientId: string): Promise<ClientRow | null> {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(clients)
    .where(and(eq(clients.userId, userId), eq(clients.id, clientId)))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

export async function listProjects(userId: string, includeArchived = false): Promise<ProjectRow[]> {
  const database = getDatabase();
  const condicao = includeArchived
    ? eq(projects.userId, userId)
    : and(eq(projects.userId, userId), isNull(projects.archivedAt));

  return database.select().from(projects).where(condicao).orderBy(projects.name);
}

export async function findProject(userId: string, projectId: string): Promise<ProjectRow | null> {
  const database = getDatabase();
  const [row] = await database
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.id, projectId)))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Coleções de um projeto
//
// Todas aceitam `projectId` opcional: sem ele, trazem tudo do usuário. É o que
// permite o painel somar o esforço de todos os projetos numa consulta só, em
// vez de uma por projeto.
// ---------------------------------------------------------------------------

export async function listTasks(userId: string, projectId?: string): Promise<TaskRow[]> {
  const database = getDatabase();
  const condicao = projectId
    ? and(eq(projectTasks.userId, userId), eq(projectTasks.projectId, projectId))
    : eq(projectTasks.userId, userId);

  return database.select().from(projectTasks).where(condicao).orderBy(projectTasks.sortOrder);
}

export async function listTimeEntries(userId: string, projectId?: string): Promise<TimeEntryRow[]> {
  const database = getDatabase();
  const condicao = projectId
    ? and(eq(timeEntries.userId, userId), eq(timeEntries.projectId, projectId))
    : eq(timeEntries.userId, userId);

  return database.select().from(timeEntries).where(condicao).orderBy(desc(timeEntries.workedOn));
}

export async function listPayments(userId: string, projectId?: string): Promise<PaymentRow[]> {
  const database = getDatabase();
  const condicao = projectId
    ? and(eq(projectPayments.userId, userId), eq(projectPayments.projectId, projectId))
    : eq(projectPayments.userId, userId);

  return database.select().from(projectPayments).where(condicao).orderBy(projectPayments.dueOn);
}

export async function listProposals(userId: string, projectId?: string): Promise<ProposalRow[]> {
  const database = getDatabase();
  const condicao = projectId
    ? and(eq(proposals.userId, userId), eq(proposals.projectId, projectId))
    : eq(proposals.userId, userId);

  return database.select().from(proposals).where(condicao).orderBy(desc(proposals.createdAt));
}

export async function listDeployments(userId: string, projectId?: string): Promise<DeploymentRow[]> {
  const database = getDatabase();
  const condicao = projectId
    ? and(eq(projectDeployments.userId, userId), eq(projectDeployments.projectId, projectId))
    : eq(projectDeployments.userId, userId);

  return database.select().from(projectDeployments).where(condicao);
}

export async function listEvents(userId: string, projectId: string, limit = 30): Promise<EventRow[]> {
  const database = getDatabase();
  return database
    .select()
    .from(projectEvents)
    .where(and(eq(projectEvents.userId, userId), eq(projectEvents.projectId, projectId)))
    .orderBy(desc(projectEvents.occurredAt))
    .limit(limit);
}

/**
 * Registra um acontecimento no histórico do projeto.
 *
 * Falhar aqui não pode derrubar a operação que gerou o evento: perder uma
 * linha de histórico é ruim, perder o pagamento que ela descrevia é pior.
 */
export async function recordEvent(input: {
  id: string;
  userId: string;
  projectId: string;
  kind: EventRow["kind"];
  summary: string;
  details?: string | null;
  occurredAt: string;
}): Promise<void> {
  await getDatabase()
    .insert(projectEvents)
    .values({
      id: input.id,
      userId: input.userId,
      projectId: input.projectId,
      kind: input.kind,
      summary: input.summary,
      details: input.details ?? null,
      occurredAt: input.occurredAt,
    });
}

/** Horas registradas por dia, para o painel de trabalho. */
export async function hoursByDay(
  userId: string,
  from: string,
  to: string,
): Promise<{ workedOn: string; durationMilli: number }[]> {
  const database = getDatabase();
  return database
    .select({
      workedOn: timeEntries.workedOn,
      durationMilli: sql<number>`sum(${timeEntries.durationMilli})`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, userId),
        sql`${timeEntries.workedOn} >= ${from}`,
        sql`${timeEntries.workedOn} <= ${to}`,
      ),
    )
    .groupBy(timeEntries.workedOn)
    .orderBy(timeEntries.workedOn);
}
