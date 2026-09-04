/**
 * Área de trabalho: casos de uso.
 *
 * A regra que dá sentido a este módulo é a ligação com o dinheiro: receber por
 * um projeto **cria um lançamento no razão**. Sem isso o Fluxo teria duas
 * contabilidades — uma do trabalho e outra da vida — e o patrimônio ignoraria
 * a receita que sustenta tudo.
 *
 * O caminho inverso não existe de propósito: apagar a receita no extrato não
 * desmarca a parcela como recebida. Quem decide sobre a parcela é o projeto, e
 * um efeito colateral invisível vindo de outra tela é exatamente o tipo de
 * acoplamento que faz um número desandar sem ninguém saber por quê.
 */

import { conflict, notFound, validationError } from "../../core/kernel/errors.ts";
import { type Cents, cents } from "../../core/kernel/money.ts";
import { newId } from "../../core/kernel/id.ts";
import { type Activity, toActivity } from "../../core/domain/work/activity.ts";
import { isOpenStatus } from "../../core/domain/work/status.ts";

/** Fases em que o trabalho está acontecendo — ou seja, ainda não foi entregue. */
const VOLTOU_AO_TRABALHO: readonly string[] = ["active", "testing", "adjustments"];
import { type Milli, milli, sumMilli } from "../../core/domain/work/hours.ts";
import {
  type ActivityTotal,
  averageHoursPerProject,
  buildTimesheet,
  type SessionLike,
  type Timesheet,
} from "../../core/domain/work/timesheet.ts";
import {
  type ProjectHealth,
  evaluateProject,
  type PaymentLike,
  type TimeEntryLike,
} from "../../core/domain/work/project.ts";
import { type LocalDate, addDays, todayIn } from "../../core/time/local-date.ts";
import { getDatabase } from "../db/client.ts";
import {
  clients,
  projectPayments,
  projectTasks,
  projects,
  proposals,
  timeEntries,
} from "../db/schema/index.ts";
import { and, eq } from "drizzle-orm";
import {
  type PaymentRow,
  type ProjectRow,
  type TaskRow,
  type TimeEntryRow,
  findProject,
  listClients,
  listDeployments,
  listEvents,
  listPayments,
  listProjects,
  listProposals,
  listTasks,
  listTimeEntries,
  recordEvent,
} from "../repositories/work.ts";
import { listDocuments } from "./documents.ts";
import { recordTransaction } from "./transactions.ts";



function paraDominio(rows: readonly PaymentRow[]): PaymentLike[] {
  return rows.map((row) => ({
    amount: cents(row.amountCents),
    dueOn: row.dueOn as LocalDate,
    receivedOn: (row.receivedOn as LocalDate | null) ?? null,
    receivedAmount: row.receivedAmountCents === null ? null : cents(row.receivedAmountCents),
  }));
}

function esforcoParaDominio(rows: readonly TimeEntryRow[]): TimeEntryLike[] {
  return rows.map((row) => ({
    duration: row.durationMilli as Milli,
    billable: row.billable,
  }));
}

/** As sessões do jeito que o relatório de horas precisa delas. */
function sessoesParaDominio(rows: readonly TimeEntryRow[]): SessionLike[] {
  return rows.map((row) => ({
    id: row.id,
    workedOn: row.workedOn as LocalDate,
    duration: row.durationMilli as Milli,
    activity: toActivity(row.activity),
    billable: row.billable,
    description: row.description,
  }));
}

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

export type ClientInput = {
  readonly name: string;
  readonly contactName?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly document?: string | null;
  readonly notes?: string | null;
  readonly color?: string | null;
};

export async function createClient(
  userId: string,
  input: ClientInput,
  now: Date = new Date(),
): Promise<string> {
  const nome = input.name.trim();
  if (!nome) {
    throw validationError("Informe o nome do cliente", [{ path: "name", message: "O nome é obrigatório" }]);
  }

  const existentes = await listClients(userId, true);
  if (existentes.some((cliente) => cliente.name.toLowerCase() === nome.toLowerCase())) {
    throw conflict("Já existe um cliente com este nome");
  }

  const id = newId(now.getTime());
  await getDatabase()
    .insert(clients)
    .values({
      id,
      userId,
      name: nome,
      contactName: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      document: input.document ?? null,
      notes: input.notes ?? null,
      ...(input.color ? { color: input.color } : {}),
    });

  return id;
}

export type ProjectInput = {
  readonly name: string;
  readonly clientId?: string | null;
  readonly description?: string | null;
  readonly status?: ProjectRow["status"];
  readonly priority?: ProjectRow["priority"];
  readonly startsOn?: LocalDate | null;
  readonly dueOn?: LocalDate | null;
  readonly contract?: Cents | null;
  readonly hourlyRate?: Cents | null;
  readonly estimatedHours?: Milli | null;
  readonly repositoryUrl?: string | null;
  readonly productionUrl?: string | null;
  readonly documentationUrl?: string | null;
  readonly mainBranch?: string | null;
  /** Painel da infraestrutura: Cloudflare, Vercel, o que hospedar. */
  readonly infraUrl?: string | null;
  /** Painel administrativo do próprio site. */
  readonly adminUrl?: string | null;
  readonly adminUser?: string | null;
  /** **Onde** a senha está, nunca a senha. */
  readonly credentialsHint?: string | null;
  readonly notes?: string | null;
  readonly color?: string | null;
};

export async function createProject(
  userId: string,
  input: ProjectInput,
  now: Date = new Date(),
): Promise<string> {
  const nome = input.name.trim();
  if (!nome) {
    throw validationError("Informe o nome do projeto", [{ path: "name", message: "O nome é obrigatório" }]);
  }

  if (input.clientId) {
    const cliente = await getDatabase()
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.userId, userId), eq(clients.id, input.clientId)))
      .limit(1);
    if (!cliente.length) throw notFound("Cliente", input.clientId);
  }

  const id = newId(now.getTime());
  await getDatabase()
    .insert(projects)
    .values({
      id,
      userId,
      clientId: input.clientId ?? null,
      name: nome,
      description: input.description ?? null,
      status: input.status ?? "active",
      priority: input.priority ?? "normal",
      startsOn: input.startsOn ?? null,
      dueOn: input.dueOn ?? null,
      contractCents: input.contract ?? 0,
      hourlyRateCents: input.hourlyRate ?? 0,
      estimatedHoursMilli: input.estimatedHours ?? 0,
      repositoryUrl: input.repositoryUrl ?? null,
      productionUrl: input.productionUrl ?? null,
      documentationUrl: input.documentationUrl ?? null,
      mainBranch: input.mainBranch ?? null,
      infraUrl: input.infraUrl ?? null,
      adminUrl: input.adminUrl ?? null,
      adminUser: input.adminUser ?? null,
      credentialsHint: input.credentialsHint ?? null,
      notes: input.notes ?? null,
      ...(input.color ? { color: input.color } : {}),
    });

  await recordEvent({
    id: newId(now.getTime()),
    userId,
    projectId: id,
    kind: "status",
    summary: `Projeto criado como ${input.status ?? "active"}`,
    occurredAt: now.toISOString(),
  });

  return id;
}

/**
 * Edita a ficha do projeto.
 *
 * Campos ausentes ficam como estão; campos enviados vazios são **limpos**. A
 * diferença importa: apagar um link é uma edição legítima, e tratar vazio como
 * "não mexe" tornaria impossível remover um endereço que mudou.
 */
export async function updateProject(
  userId: string,
  projectId: string,
  input: Partial<ProjectInput>,
  now: Date = new Date(),
): Promise<void> {
  const projeto = await findProject(userId, projectId);
  if (!projeto) throw notFound("Projeto", projectId);

  if (input.clientId) {
    const [cliente] = await getDatabase()
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.userId, userId), eq(clients.id, input.clientId)))
      .limit(1);
    if (!cliente) throw notFound("Cliente", input.clientId);
  }

  const nome = input.name?.trim();
  if (input.name !== undefined && !nome) {
    throw validationError("O projeto precisa de um nome", [
      { path: "name", message: "O nome não pode ficar vazio" },
    ]);
  }

  // `undefined` é "não mexe"; `null` ou string vazia limpam o campo.
  const texto = (valor: string | null | undefined) => {
    if (valor === undefined) return undefined;
    const limpo = valor?.trim() ?? "";
    return limpo === "" ? null : limpo;
  };

  await getDatabase()
    .update(projects)
    .set({
      ...(nome ? { name: nome } : {}),
      ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
      ...(input.description !== undefined ? { description: texto(input.description) } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.startsOn !== undefined ? { startsOn: input.startsOn } : {}),
      ...(input.dueOn !== undefined ? { dueOn: input.dueOn } : {}),
      ...(input.contract !== undefined ? { contractCents: input.contract ?? 0 } : {}),
      ...(input.hourlyRate !== undefined ? { hourlyRateCents: input.hourlyRate ?? 0 } : {}),
      ...(input.estimatedHours !== undefined ? { estimatedHoursMilli: input.estimatedHours ?? 0 } : {}),
      ...(input.repositoryUrl !== undefined ? { repositoryUrl: texto(input.repositoryUrl) } : {}),
      ...(input.mainBranch !== undefined ? { mainBranch: texto(input.mainBranch) } : {}),
      ...(input.productionUrl !== undefined ? { productionUrl: texto(input.productionUrl) } : {}),
      ...(input.documentationUrl !== undefined ? { documentationUrl: texto(input.documentationUrl) } : {}),
      ...(input.infraUrl !== undefined ? { infraUrl: texto(input.infraUrl) } : {}),
      ...(input.adminUrl !== undefined ? { adminUrl: texto(input.adminUrl) } : {}),
      ...(input.adminUser !== undefined ? { adminUser: texto(input.adminUser) } : {}),
      ...(input.credentialsHint !== undefined ? { credentialsHint: texto(input.credentialsHint) } : {}),
      ...(input.notes !== undefined ? { notes: texto(input.notes) } : {}),
      ...(input.color !== undefined ? { color: input.color ?? projeto.color } : {}),
      updatedAt: now.toISOString(),
    })
    .where(and(eq(projects.userId, userId), eq(projects.id, projectId)));
}

export async function updateProjectStatus(
  userId: string,
  projectId: string,
  status: ProjectRow["status"],
  now: Date = new Date(),
): Promise<void> {
  const projeto = await findProject(userId, projectId);
  if (!projeto) throw notFound("Projeto", projectId);
  if (projeto.status === status) return;

  await getDatabase()
    .update(projects)
    .set({
      status,
      // Entregar carimba a data: é ela que decide se o prazo foi cumprido, e
      // deduzi-la depois pelo histórico seria adivinhação. Concluir carimba
      // também, quando ninguém marcou a entrega antes — encerrar um projeto
      // que nunca foi entregue deixaria o prazo em aberto para sempre.
      // Cancelar não carimba: cancelado não é entregue.
      ...((status === "delivered" || status === "done") && !projeto.deliveredOn
        ? { deliveredOn: todayIn(now) }
        : {}),
      // Voltar para uma fase de trabalho limpa a data: um projeto que voltou
      // para ajustes **não está** entregue agora, e manter o carimbo o tiraria
      // do radar de atraso — o prazo pararia de ser cobrado justamente quando
      // voltou a existir. O histórico da entrega fica no registro de eventos.
      ...(VOLTOU_AO_TRABALHO.includes(status) && projeto.deliveredOn ? { deliveredOn: null } : {}),
      updatedAt: now.toISOString(),
    })
    .where(and(eq(projects.userId, userId), eq(projects.id, projectId)));

  await recordEvent({
    id: newId(now.getTime()),
    userId,
    projectId,
    kind: "status",
    summary: `Situação: ${projeto.status} → ${status}`,
    occurredAt: now.toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Tarefas
// ---------------------------------------------------------------------------

export type TaskInput = {
  readonly projectId: string;
  readonly title: string;
  readonly details?: string | null;
  readonly kind?: "feature" | "support" | "improvement" | "chore" | "bug";
  readonly priority?: ProjectRow["priority"];
  readonly dueOn?: LocalDate | null;
  readonly estimate?: Milli | null;
  readonly billable?: boolean;
};

export async function createTask(
  userId: string,
  input: TaskInput,
  now: Date = new Date(),
): Promise<string> {
  const projeto = await findProject(userId, input.projectId);
  if (!projeto) throw notFound("Projeto", input.projectId);

  const titulo = input.title.trim();
  if (!titulo) {
    throw validationError("Informe o que precisa ser feito", [
      { path: "title", message: "O título é obrigatório" },
    ]);
  }

  const existentes = await listTasks(userId, input.projectId);
  const id = newId(now.getTime());

  await getDatabase()
    .insert(projectTasks)
    .values({
      id,
      userId,
      projectId: input.projectId,
      title: titulo,
      details: input.details ?? null,
      kind: input.kind ?? "feature",
      priority: input.priority ?? "normal",
      dueOn: input.dueOn ?? null,
      estimateMilli: input.estimate ?? 0,
      // Suporte nasce não cobrável: consertar o que deveria funcionar
      // normalmente não se cobra, e o padrão certo é o que quase sempre vale.
      billable: input.billable ?? input.kind !== "support",
      sortOrder: existentes.length,
    });

  return id;
}

export async function setTaskStatus(
  userId: string,
  taskId: string,
  status: "todo" | "doing" | "blocked" | "review" | "done",
  now: Date = new Date(),
): Promise<void> {
  const [tarefa] = await getDatabase()
    .select()
    .from(projectTasks)
    .where(and(eq(projectTasks.userId, userId), eq(projectTasks.id, taskId)))
    .limit(1);
  if (!tarefa) throw notFound("Tarefa", taskId);

  await getDatabase()
    .update(projectTasks)
    .set({
      status,
      completedAt: status === "done" ? now.toISOString() : null,
      updatedAt: now.toISOString(),
    })
    .where(and(eq(projectTasks.userId, userId), eq(projectTasks.id, taskId)));
}

// ---------------------------------------------------------------------------
// Horas
// ---------------------------------------------------------------------------

export type TimeEntryInput = {
  readonly projectId: string;
  readonly taskId?: string | null;
  readonly workedOn: LocalDate;
  readonly duration: Milli;
  readonly description: string;
  readonly activity?: Activity;
  readonly billable?: boolean;
};

export async function logTime(
  userId: string,
  input: TimeEntryInput,
  now: Date = new Date(),
): Promise<string> {
  const projeto = await findProject(userId, input.projectId);
  if (!projeto) throw notFound("Projeto", input.projectId);

  const duracao = milli(input.duration);
  if (duracao === 0) {
    throw validationError("Informe quanto tempo levou", [
      { path: "duration", message: "A duração precisa ser maior que zero" },
    ]);
  }

  if (input.workedOn > todayIn(now)) {
    throw validationError("Não dá para registrar trabalho no futuro", [
      { path: "workedOn", message: "Informe a data em que o trabalho aconteceu" },
    ]);
  }

  const id = newId(now.getTime());
  await getDatabase()
    .insert(timeEntries)
    .values({
      id,
      userId,
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      workedOn: input.workedOn,
      durationMilli: duracao,
      description: input.description.trim(),
      activity: input.activity ?? "development",
      billable: input.billable ?? true,
    });

  return id;
}

/**
 * Corrige uma sessão já lançada.
 *
 * Lançar hora errada é a regra, não a exceção: registra-se no fim do dia, de
 * memória, e no dia seguinte se percebe que foram três horas e não duas. Sem
 * correção, o jeito de consertar seria apagar e relançar — e aí o relatório de
 * um projeto entregue nunca fecha com o que aconteceu.
 *
 * Só o que vem preenchido muda. Passar o objeto inteiro obrigaria a tela a
 * reenviar campos que ninguém tocou, e um deles chegaria errado.
 */
export async function updateTimeEntry(
  userId: string,
  entryId: string,
  patch: {
    readonly workedOn?: LocalDate | null;
    readonly duration?: Milli | null;
    readonly description?: string | null;
    readonly activity?: Activity | null;
    readonly billable?: boolean | null;
    readonly taskId?: string | null;
    readonly clearTask?: boolean;
  },
  now: Date = new Date(),
): Promise<void> {
  const database = getDatabase();

  const [existente] = await database
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), eq(timeEntries.id, entryId)))
    .limit(1);
  if (!existente) throw notFound("Sessão de trabalho", entryId);

  if (patch.workedOn && patch.workedOn > todayIn(now)) {
    throw validationError("Não dá para registrar trabalho no futuro", [
      { path: "workedOn", message: "Informe a data em que o trabalho aconteceu" },
    ]);
  }

  const campos: Record<string, unknown> = { updatedAt: now.toISOString() };
  if (patch.workedOn) campos.workedOn = patch.workedOn;
  if (patch.duration !== null && patch.duration !== undefined) {
    const duracao = milli(patch.duration);
    if (duracao === 0) {
      throw validationError("Informe quanto tempo levou", [
        { path: "duration", message: "A duração precisa ser maior que zero" },
      ]);
    }
    campos.durationMilli = duracao;
  }
  if (patch.description) campos.description = patch.description.trim();
  if (patch.activity) campos.activity = patch.activity;
  if (patch.billable !== null && patch.billable !== undefined) campos.billable = patch.billable;
  if (patch.taskId) campos.taskId = patch.taskId;
  else if (patch.clearTask) campos.taskId = null;

  await database
    .update(timeEntries)
    .set(campos)
    .where(and(eq(timeEntries.userId, userId), eq(timeEntries.id, entryId)));
}

/**
 * Apaga uma sessão.
 *
 * Apaga de verdade, sem histórico: hora lançada por engano não é fato do
 * projeto, é digitação errada. Guardá-la marcada como excluída faria toda
 * soma precisar lembrar de filtrar — e uma que esquecesse cobraria o cliente
 * por um tempo que nunca existiu.
 */
export async function removeTimeEntry(userId: string, entryId: string): Promise<boolean> {
  const database = getDatabase();

  const [existente] = await database
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(and(eq(timeEntries.userId, userId), eq(timeEntries.id, entryId)))
    .limit(1);
  if (!existente) return false;

  await database
    .delete(timeEntries)
    .where(and(eq(timeEntries.userId, userId), eq(timeEntries.id, entryId)));
  return true;
}


// ---------------------------------------------------------------------------
// Cobrança
// ---------------------------------------------------------------------------

export type PaymentInput = {
  readonly projectId: string;
  readonly description: string;
  readonly amount: Cents;
  readonly dueOn: LocalDate;
  readonly notes?: string | null;
};

export async function schedulePayment(
  userId: string,
  input: PaymentInput,
  now: Date = new Date(),
): Promise<string> {
  const projeto = await findProject(userId, input.projectId);
  if (!projeto) throw notFound("Projeto", input.projectId);

  if (input.amount <= 0) {
    throw validationError("Informe um valor maior que zero", [
      { path: "amount", message: "O valor da parcela precisa ser positivo" },
    ]);
  }

  const id = newId(now.getTime());
  await getDatabase()
    .insert(projectPayments)
    .values({
      id,
      userId,
      projectId: input.projectId,
      description: input.description.trim(),
      amountCents: input.amount,
      dueOn: input.dueOn,
      notes: input.notes ?? null,
    });

  return id;
}

/**
 * Marca a parcela como recebida e **cria a receita no razão**.
 *
 * É aqui que a área de trabalho encontra a financeira. A receita é um
 * lançamento comum, na conta escolhida, e a partir dele o dinheiro do trabalho
 * conta no saldo, no patrimônio e no livre para gastar como qualquer outro.
 */
export async function receivePayment(
  userId: string,
  paymentId: string,
  input: {
    accountId: string;
    receivedOn?: LocalDate | null;
    categoryId?: string | null;
    /**
     * O que entrou de verdade, quando difere do combinado.
     *
     * O razão precisa registrar o que o banco mostra. Lançar o valor da parcela
     * quando entrou outro faz o saldo do Fluxo divergir do extrato — e a
     * divergência aparece meses depois, sem rastro de onde nasceu.
     */
    amount?: Cents | null;
  },
  now: Date = new Date(),
): Promise<{ transactionId: string }> {
  const database = getDatabase();
  const [parcela] = await database
    .select()
    .from(projectPayments)
    .where(and(eq(projectPayments.userId, userId), eq(projectPayments.id, paymentId)))
    .limit(1);
  if (!parcela) throw notFound("Parcela", paymentId);
  if (parcela.receivedOn) throw conflict("Esta parcela já foi recebida");

  const projeto = await findProject(userId, parcela.projectId);
  if (!projeto) throw notFound("Projeto", parcela.projectId);

  const recebidoEm = input.receivedOn ?? todayIn(now);
  const entrou = input.amount ?? cents(parcela.amountCents);

  const { ids } = await recordTransaction(
    userId,
    {
      kind: "income",
      description: `${projeto.name} · ${parcela.description}`,
      amount: entrou,
      occurredOn: recebidoEm,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      state: "confirmed",
    },
    now,
  );

  await database
    .update(projectPayments)
    .set({
      receivedOn: recebidoEm,
      // Só guarda quando divergiu: nulo continua significando "entrou o combinado".
      receivedAmountCents: entrou === parcela.amountCents ? null : entrou,
      transactionId: ids[0],
      updatedAt: now.toISOString(),
    })
    .where(and(eq(projectPayments.userId, userId), eq(projectPayments.id, paymentId)));

  await recordEvent({
    id: newId(now.getTime()),
    userId,
    projectId: parcela.projectId,
    kind: "payment",
    summary: `Recebido: ${parcela.description}`,
    occurredAt: now.toISOString(),
  });

  return { transactionId: ids[0] };
}

// ---------------------------------------------------------------------------
// Propostas
// ---------------------------------------------------------------------------

export type ProposalInput = {
  readonly projectId: string;
  readonly title: string;
  readonly amount: Cents;
  readonly scope?: string | null;
  readonly conditions?: string | null;
  readonly deadlineDays?: number | null;
  readonly fileUrl?: string | null;
  readonly notes?: string | null;
};

export async function createProposal(
  userId: string,
  input: ProposalInput,
  now: Date = new Date(),
): Promise<string> {
  const projeto = await findProject(userId, input.projectId);
  if (!projeto) throw notFound("Projeto", input.projectId);

  const titulo = input.title.trim();
  if (!titulo) {
    throw validationError("Informe o título da proposta", [
      { path: "title", message: "O título é obrigatório" },
    ]);
  }

  const id = newId(now.getTime());
  await getDatabase()
    .insert(proposals)
    .values({
      id,
      userId,
      projectId: input.projectId,
      clientId: projeto.clientId,
      title: titulo,
      scope: input.scope ?? null,
      conditions: input.conditions ?? null,
      amountCents: input.amount,
      deadlineDays: input.deadlineDays ?? null,
      fileUrl: input.fileUrl ?? null,
      notes: input.notes ?? null,
    });

  return id;
}

/**
 * Move a proposta pelo seu ciclo.
 *
 * Aceitar uma proposta **atualiza o valor contratado do projeto** quando ele
 * ainda não tinha contrato. É o momento em que a promessa vira compromisso, e
 * exigir que o usuário digite o mesmo número duas vezes seria pedir para os
 * dois divergirem. Se já houver contrato, o valor não é sobrescrito em
 * silêncio: mexer em dinheiro já combinado é decisão explícita.
 */
export async function decideProposal(
  userId: string,
  proposalId: string,
  status: "sent" | "accepted" | "rejected" | "expired",
  now: Date = new Date(),
): Promise<void> {
  const database = getDatabase();
  const [proposta] = await database
    .select()
    .from(proposals)
    .where(and(eq(proposals.userId, userId), eq(proposals.id, proposalId)))
    .limit(1);
  if (!proposta) throw notFound("Proposta", proposalId);

  const hoje = todayIn(now);

  await database
    .update(proposals)
    .set({
      status,
      ...(status === "sent" ? { sentOn: hoje } : {}),
      ...(status === "accepted" || status === "rejected" ? { decidedOn: hoje } : {}),
      updatedAt: now.toISOString(),
    })
    .where(and(eq(proposals.userId, userId), eq(proposals.id, proposalId)));

  if (status === "accepted" && proposta.projectId) {
    const projeto = await findProject(userId, proposta.projectId);
    if (projeto && projeto.contractCents === 0) {
      await database
        .update(projects)
        .set({ contractCents: proposta.amountCents, updatedAt: now.toISOString() })
        .where(and(eq(projects.userId, userId), eq(projects.id, proposta.projectId)));
    }

    await recordEvent({
      id: newId(now.getTime()),
      userId,
      projectId: proposta.projectId,
      kind: "proposal",
      summary: `Proposta aceita: ${proposta.title}`,
      occurredAt: now.toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

export type ProjectSummary = {
  readonly id: string;
  readonly name: string;
  readonly clientName: string | null;
  readonly status: ProjectRow["status"];
  readonly priority: ProjectRow["priority"];
  readonly color: string;
  readonly dueOn: LocalDate | null;
  readonly health: ProjectHealth;
  readonly openTasks: number;
};

export type WorkOverview = {
  readonly today: LocalDate;
  readonly projects: readonly ProjectSummary[];
  readonly totals: {
    readonly activeProjects: number;
    readonly contractedCents: number;
    readonly receivedCents: number;
    readonly pendingCents: number;
    readonly overdueCents: number;
    readonly lateProjects: number;
    readonly weekMilli: number;
  };
};

export async function buildWorkOverview(userId: string, now: Date = new Date()): Promise<WorkOverview> {
  const today = todayIn(now);

  const [listaProjetos, listaClientes, tarefas, horas, parcelas] = await Promise.all([
    listProjects(userId),
    listClients(userId, true),
    listTasks(userId),
    listTimeEntries(userId),
    listPayments(userId),
  ]);

  const nomeCliente = new Map(listaClientes.map((cliente) => [cliente.id, cliente.name]));

  const projectSummaries = listaProjetos.map((projeto) => {
    const doProjeto = parcelas.filter((parcela) => parcela.projectId === projeto.id);
    const sessoes = horas.filter((sessao) => sessao.projectId === projeto.id);

    return {
      id: projeto.id,
      name: projeto.name,
      clientName: projeto.clientId ? (nomeCliente.get(projeto.clientId) ?? null) : null,
      status: projeto.status,
      priority: projeto.priority,
      color: projeto.color,
      dueOn: (projeto.dueOn as LocalDate | null) ?? null,
      health: evaluateProject({
        contracted: cents(projeto.contractCents),
        estimated: projeto.estimatedHoursMilli as Milli,
        plannedRate: cents(projeto.hourlyRateCents),
        payments: paraDominio(doProjeto),
        entries: esforcoParaDominio(sessoes),
        dueOn: (projeto.dueOn as LocalDate | null) ?? null,
        deliveredOn: (projeto.deliveredOn as LocalDate | null) ?? null,
        today,
      }),
      openTasks: tarefas.filter(
        (tarefa) => tarefa.projectId === projeto.id && tarefa.status !== "done",
      ).length,
    } satisfies ProjectSummary;
  });

  const inicioDaSemana = addDays(today, -6);
  const weekMilli = horas
    .filter((sessao) => sessao.workedOn >= inicioDaSemana && sessao.workedOn <= today)
    .reduce((soma, sessao) => soma + sessao.durationMilli, 0);

  return {
    today,
    projects: projectSummaries,
    totals: {
      activeProjects: projectSummaries.filter((projeto) => isOpenStatus(projeto.status)).length,
      contractedCents: projectSummaries.reduce((soma, item) => soma + item.health.finance.contracted, 0),
      receivedCents: projectSummaries.reduce((soma, item) => soma + item.health.finance.received, 0),
      pendingCents: projectSummaries.reduce((soma, item) => soma + item.health.finance.pending, 0),
      overdueCents: projectSummaries.reduce((soma, item) => soma + item.health.finance.overdue, 0),
      lateProjects: projectSummaries.filter((item) => item.health.deadline.status === "atrasado").length,
      weekMilli,
    },
  };
}

export type ProjectDetail = {
  readonly today: LocalDate;
  readonly project: ProjectRow;
  readonly clientName: string | null;
  readonly health: ProjectHealth;
  readonly tasks: Awaited<ReturnType<typeof listTasks>>;
  readonly entries: Awaited<ReturnType<typeof listTimeEntries>>;
  readonly payments: Awaited<ReturnType<typeof listPayments>>;
  readonly proposals: Awaited<ReturnType<typeof listProposals>>;
  readonly documents: Awaited<ReturnType<typeof listDocuments>>;
  readonly deployments: Awaited<ReturnType<typeof listDeployments>>;
  readonly events: Awaited<ReturnType<typeof listEvents>>;
};

export async function buildProjectDetail(
  userId: string,
  projectId: string,
  now: Date = new Date(),
): Promise<ProjectDetail> {
  const projeto = await findProject(userId, projectId);
  if (!projeto) throw notFound("Projeto", projectId);

  const today = todayIn(now);
  const [tasks, entries, payments, propostas, deployments, events, listaClientes, documents] = await Promise.all([
    listTasks(userId, projectId),
    listTimeEntries(userId, projectId),
    listPayments(userId, projectId),
    listProposals(userId, projectId),
    listDeployments(userId, projectId),
    listEvents(userId, projectId),
    listClients(userId, true),
    listDocuments(userId, projectId),
  ]);

  return {
    today,
    project: projeto,
    clientName: projeto.clientId
      ? (listaClientes.find((cliente) => cliente.id === projeto.clientId)?.name ?? null)
      : null,
    health: evaluateProject({
      contracted: cents(projeto.contractCents),
      estimated: projeto.estimatedHoursMilli as Milli,
      plannedRate: cents(projeto.hourlyRateCents),
      payments: paraDominio(payments),
      entries: esforcoParaDominio(entries),
      dueOn: (projeto.dueOn as LocalDate | null) ?? null,
      deliveredOn: (projeto.deliveredOn as LocalDate | null) ?? null,
      today,
    }),
    tasks,
    entries,
    payments,
    proposals: propostas,
    documents,
    deployments,
    events,
  };
}

export { listClients, listProjects, findProject };

// ---------------------------------------------------------------------------
// Quadro de tarefas
// ---------------------------------------------------------------------------

export type BoardTask = {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectColor: string | null;
  readonly clientName: string | null;
  readonly title: string;
  readonly details: string | null;
  readonly kind: TaskRow["kind"];
  readonly priority: TaskRow["priority"];
  readonly status: TaskRow["status"];
  readonly dueOn: LocalDate | null;
  readonly billable: boolean;
  /** Vencida e ainda não concluída. */
  readonly isLate: boolean;
};

export type BoardView = {
  readonly today: LocalDate;
  readonly tasks: readonly BoardTask[];
  readonly projects: readonly { id: string; name: string; color: string | null }[];
};

/**
 * O quadro de tarefas de todos os projetos.
 *
 * Um quadro por projeto responderia "o que falta neste projeto"; quem trabalha
 * em cinco ao mesmo tempo precisa da outra pergunta — "o que está travado, em
 * qualquer lugar". Por isso a tarefa carrega o projeto, e não o contrário.
 *
 * Projeto encerrado fica de fora: tarefa de projeto concluído não é trabalho
 * pendente, é histórico, e enche a coluna com o que ninguém vai fazer.
 */
export async function buildBoard(userId: string, now: Date = new Date()): Promise<BoardView> {
  const today = todayIn(now);

  const [listaProjetos, listaClientes, tarefas] = await Promise.all([
    listProjects(userId),
    listClients(userId, true),
    listTasks(userId),
  ]);

  const nomeCliente = new Map(listaClientes.map((cliente) => [cliente.id, cliente.name]));
  const abertos = listaProjetos.filter(
    (projeto) => !["done", "cancelled"].includes(projeto.status),
  );
  const porId = new Map(abertos.map((projeto) => [projeto.id, projeto]));

  const doQuadro = tarefas.filter((tarefa) => porId.has(tarefa.projectId));

  return {
    today,
    tasks: doQuadro.map((tarefa) => {
      const projeto = porId.get(tarefa.projectId)!;
      const prazo = (tarefa.dueOn as LocalDate | null) ?? null;

      return {
        id: tarefa.id,
        projectId: projeto.id,
        projectName: projeto.name,
        projectColor: projeto.color,
        clientName: projeto.clientId ? (nomeCliente.get(projeto.clientId) ?? null) : null,
        title: tarefa.title,
        details: tarefa.details,
        kind: tarefa.kind,
        priority: tarefa.priority,
        status: tarefa.status,
        dueOn: prazo,
        billable: tarefa.billable,
        isLate: prazo !== null && prazo < today && tarefa.status !== "done",
      } satisfies BoardTask;
    }),
    projects: abertos.map((projeto) => ({
      id: projeto.id,
      name: projeto.name,
      color: projeto.color,
    })),
  };
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

export type AgendaKind = "task" | "payment" | "delivery" | "proposal";

export type AgendaItem = {
  readonly id: string;
  readonly kind: AgendaKind;
  readonly on: LocalDate;
  readonly title: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly projectColor: string | null;
  readonly clientName: string | null;
  /** Só para parcela e proposta: o dinheiro em jogo naquela data. */
  readonly amountCents: number | null;
  readonly isLate: boolean;
  readonly isDone: boolean;
};

export type AgendaView = {
  readonly today: LocalDate;
  readonly items: readonly AgendaItem[];
};

/** Janela da agenda: o mês corrente e os dois seguintes bastam para planejar. */
const AGENDA_DIAS = 90;

/**
 * O que tem data marcada na área de trabalho.
 *
 * Prazo de tarefa, vencimento de parcela, entrega de projeto e proposta
 * esperando resposta ocupam o mesmo calendário porque disputam os mesmos dias.
 * Separá-los em quatro listas esconde exatamente o que a agenda existe para
 * mostrar: a semana em que a entrega, a cobrança e o prazo caem juntos.
 *
 * O passado entra só quando ainda está em aberto — uma parcela vencida e não
 * recebida continua sendo trabalho de hoje; uma já recebida é histórico.
 */
export async function buildAgenda(userId: string, now: Date = new Date()): Promise<AgendaView> {
  const today = todayIn(now);
  const limite = addDays(today, AGENDA_DIAS);

  const [listaProjetos, listaClientes, tarefas, parcelas, propostas] = await Promise.all([
    listProjects(userId),
    listClients(userId, true),
    listTasks(userId),
    listPayments(userId),
    listProposals(userId),
  ]);

  const nomeCliente = new Map(listaClientes.map((cliente) => [cliente.id, cliente.name]));
  const porId = new Map(listaProjetos.map((projeto) => [projeto.id, projeto]));

  const contexto = (projectId: string | null) => {
    const projeto = projectId ? porId.get(projectId) : undefined;
    return {
      projectId: projeto?.id ?? null,
      projectName: projeto?.name ?? null,
      projectColor: projeto?.color ?? null,
      clientName: projeto?.clientId ? (nomeCliente.get(projeto.clientId) ?? null) : null,
    };
  };

  const itens: AgendaItem[] = [];

  for (const tarefa of tarefas) {
    const prazo = (tarefa.dueOn as LocalDate | null) ?? null;
    if (!prazo || prazo > limite) continue;
    const feita = tarefa.status === "done";
    // Tarefa vencida e concluída é ruído: ninguém precisa saber que fechou tarde.
    if (feita && prazo < today) continue;

    itens.push({
      id: `task:${tarefa.id}`,
      kind: "task",
      on: prazo,
      title: tarefa.title,
      ...contexto(tarefa.projectId),
      amountCents: null,
      isLate: !feita && prazo < today,
      isDone: feita,
    });
  }

  for (const parcela of parcelas) {
    const vencimento = parcela.dueOn as LocalDate;
    if (vencimento > limite) continue;
    const recebida = parcela.receivedOn !== null;
    if (recebida && vencimento < today) continue;

    itens.push({
      id: `payment:${parcela.id}`,
      kind: "payment",
      on: vencimento,
      title: parcela.description,
      ...contexto(parcela.projectId),
      amountCents: parcela.receivedAmountCents ?? parcela.amountCents,
      isLate: !recebida && vencimento < today,
      isDone: recebida,
    });
  }

  for (const projeto of listaProjetos) {
    const entrega = (projeto.dueOn as LocalDate | null) ?? null;
    if (!entrega || entrega > limite) continue;
    const entregue = projeto.deliveredOn !== null;
    if (entregue && entrega < today) continue;

    itens.push({
      id: `delivery:${projeto.id}`,
      kind: "delivery",
      on: entrega,
      // O nome do projeto já aparece na linha de baixo; repeti-lo no título
      // gastaria a largura da tela dizendo a mesma coisa duas vezes.
      title: "Entrega do projeto",
      ...contexto(projeto.id),
      amountCents: null,
      isLate: !entregue && entrega < today,
      isDone: entregue,
    });
  }

  for (const proposta of propostas) {
    // Só a que foi enviada e ainda não teve resposta ocupa lugar na agenda: o
    // rascunho não cobra retorno de ninguém.
    if (proposta.status !== "sent" || !proposta.sentOn) continue;
    const cobrar = addDays(proposta.sentOn as LocalDate, proposta.deadlineDays ?? 7);
    if (cobrar > limite) continue;

    itens.push({
      id: `proposal:${proposta.id}`,
      kind: "proposal",
      on: cobrar,
      title: `Cobrar resposta · ${proposta.title}`,
      ...contexto(proposta.projectId),
      amountCents: proposta.amountCents,
      isLate: cobrar < today,
      isDone: false,
    });
  }

  return {
    today,
    items: itens.sort((esquerda, direita) => esquerda.on.localeCompare(direita.on)),
  };
}

// ---------------------------------------------------------------------------
// Relatório de horas
// ---------------------------------------------------------------------------

export type SessionRow = {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly clientName: string | null;
  readonly workedOn: LocalDate;
  readonly durationMilli: number;
  readonly activity: Activity;
  readonly billable: boolean;
  readonly description: string;
  readonly taskId: string | null;
  readonly taskTitle: string | null;
};

export type ProjectTimesheet = {
  readonly projectId: string;
  readonly projectName: string;
  readonly clientName: string | null;
  readonly status: ProjectRow["status"];
  readonly isOpen: boolean;
  readonly contractedCents: number;
  readonly plannedRateCents: number;
  readonly estimatedMilli: number;
  readonly summary: Timesheet;
};

export type TimesheetReport = {
  readonly today: LocalDate;
  /** Um relatório por projeto que teve tempo lançado, do maior para o menor. */
  readonly projects: readonly ProjectTimesheet[];
  readonly sessions: readonly SessionRow[];
  readonly totals: {
    readonly worked: Milli;
    readonly billableWorked: Milli;
    readonly sessions: number;
    readonly revenueCents: number;
    /** Receita total ÷ horas totais. `null` sem horas. */
    readonly effectiveRateCents: number | null;
    /** Média de horas entre os projetos que tiveram tempo lançado. */
    readonly averageHoursPerProject: number;
    readonly byActivity: readonly ActivityTotal[];
  };
};

/**
 * O relatório de horas, de um projeto ou de todos.
 *
 * Passar `projectId` recorta num projeto — é o relatório de fechamento, o que
 * se olha quando o trabalho acaba e a pergunta é se valeu a pena. Sem ele, o
 * recorte é a carteira inteira, e aí a média de horas por projeto passa a
 * significar alguma coisa.
 *
 * A receita de cada projeto é o que **entrou** (parcelas recebidas), não o
 * contratado: um contrato de dez mil com três mil recebidos rendeu três mil, e
 * o valor/hora efetivo tem de dizer isso enquanto o resto não chega.
 */
export async function buildTimesheetReport(
  userId: string,
  projectId?: string,
  now: Date = new Date(),
): Promise<TimesheetReport> {
  const today = todayIn(now);

  const [listaProjetos, listaClientes, horas, parcelas, tarefas] = await Promise.all([
    listProjects(userId),
    listClients(userId, true),
    listTimeEntries(userId, projectId),
    listPayments(userId, projectId),
    listTasks(userId, projectId),
  ]);

  const nomeCliente = new Map(listaClientes.map((cliente) => [cliente.id, cliente.name]));
  const porId = new Map(listaProjetos.map((projeto) => [projeto.id, projeto]));
  const tituloDaTarefa = new Map(tarefas.map((tarefa) => [tarefa.id, tarefa.title]));

  const doRecorte = projectId ? horas.filter((hora) => hora.projectId === projectId) : horas;

  const sessions: SessionRow[] = doRecorte
    .map((hora) => {
      const projeto = porId.get(hora.projectId);
      return {
        id: hora.id,
        projectId: hora.projectId,
        projectName: projeto?.name ?? "Projeto removido",
        clientName: projeto?.clientId ? (nomeCliente.get(projeto.clientId) ?? null) : null,
        workedOn: hora.workedOn as LocalDate,
        durationMilli: hora.durationMilli,
        activity: toActivity(hora.activity),
        billable: hora.billable,
        description: hora.description,
        taskId: hora.taskId,
        taskTitle: hora.taskId ? (tituloDaTarefa.get(hora.taskId) ?? null) : null,
      };
    })
    // Da mais recente para a mais antiga: quem abre o detalhamento quer
    // conferir o que lançou hoje, não arqueologia do primeiro dia.
    .sort((esquerda, direita) => direita.workedOn.localeCompare(esquerda.workedOn));

  const comTempo = [...new Set(doRecorte.map((hora) => hora.projectId))];

  const projects: ProjectTimesheet[] = comTempo
    .map((id) => {
      const projeto = porId.get(id);
      const doProjeto = doRecorte.filter((hora) => hora.projectId === id);
      const recebido = parcelas
        .filter((parcela) => parcela.projectId === id && parcela.receivedOn !== null)
        .reduce((soma, parcela) => soma + (parcela.receivedAmountCents ?? parcela.amountCents), 0);

      return {
        projectId: id,
        projectName: projeto?.name ?? "Projeto removido",
        clientName: projeto?.clientId ? (nomeCliente.get(projeto.clientId) ?? null) : null,
        status: projeto?.status ?? "done",
        isOpen: projeto ? isOpenStatus(projeto.status) : false,
        contractedCents: projeto?.contractCents ?? 0,
        plannedRateCents: projeto?.hourlyRateCents ?? 0,
        estimatedMilli: projeto?.estimatedHoursMilli ?? 0,
        summary: buildTimesheet(sessoesParaDominio(doProjeto), cents(recebido)),
      };
    })
    .sort((esquerda, direita) => direita.summary.worked - esquerda.summary.worked);

  const worked = sumMilli(projects.map((linha) => linha.summary.worked));
  const revenueCents = projects.reduce((soma, linha) => soma + linha.summary.revenue, 0);

  // O total por categoria atravessa os projetos: a pergunta "quanto do meu
  // tempo é retrabalho" não é sobre um projeto, é sobre o jeito de trabalhar.
  const geral = buildTimesheet(sessoesParaDominio(doRecorte), cents(revenueCents));

  return {
    today,
    projects,
    sessions,
    totals: {
      worked,
      billableWorked: geral.billableWorked,
      sessions: doRecorte.length,
      revenueCents,
      effectiveRateCents: geral.effectiveRate,
      averageHoursPerProject: averageHoursPerProject(projects.map((linha) => linha.summary.worked)),
      byActivity: geral.byActivity,
    },
  };
}
