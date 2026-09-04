/**
 * Área de trabalho contra o banco.
 *
 * O teste que mais importa aqui é o da costura entre as duas metades do Fluxo:
 * receber por um projeto tem de virar receita no razão. Se isso falhar, o
 * trabalho vira uma planilha paralela e o patrimônio ignora justamente o
 * dinheiro que entra.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { fromHours } from "../../core/domain/work/hours.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-08-20T12:00:00Z");

async function projetoComCliente(userId: string) {
  const { createClient, createProject } = await import("./work.ts");

  const clienteId = await createClient(userId, { name: "Padaria do Bairro" }, AGORA);
  const projetoId = await createProject(
    userId,
    {
      name: "Site institucional",
      clientId: clienteId,
      contract: cents(600_000),
      hourlyRate: cents(12_000),
      estimatedHours: fromHours(40),
      dueOn: localDate("2026-09-30"),
    },
    AGORA,
  );

  return { clienteId, projetoId };
}

describe("projetos", () => {
  beforeEach(() => zerar());

  it("nasce com o histórico já registrando a criação", async () => {
    const { buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    const detalhe = await buildProjectDetail(alvo.userId, projetoId, AGORA);

    assert.equal(detalhe.project.name, "Site institucional");
    assert.equal(detalhe.clientName, "Padaria do Bairro");
    assert.equal(detalhe.events.length, 1);
  });

  it("recusa projeto para cliente de outra pessoa", async () => {
    const { createClient, createProject } = await import("./work.ts");
    const { signUp } = await import("./auth.ts");
    const alvo = await ambiente();

    const { user: outro } = await signUp({
      email: "outro-dev@fluxo.app",
      password: "senha-do-outro-123",
      displayName: "Outro",
    });
    const clienteDoOutro = await createClient(outro.id, { name: "Cliente alheio" }, AGORA);

    await assert.rejects(
      () => createProject(alvo.userId, { name: "Invasão", clientId: clienteDoOutro }, AGORA),
      /Cliente/,
    );
  });

  it("entregar carimba a data e registra no histórico", async () => {
    const { updateProjectStatus, buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    await updateProjectStatus(alvo.userId, projetoId, "delivered", AGORA);
    const detalhe = await buildProjectDetail(alvo.userId, projetoId, AGORA);

    assert.equal(detalhe.project.deliveredOn, "2026-08-20");
    assert.equal(detalhe.health.deadline.status, "entregue");
    assert.equal(detalhe.events.length, 2);
  });
});

describe("horas", () => {
  beforeEach(() => zerar());

  it("herda o valor/hora do projeto e o congela", async () => {
    const { logTime, buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    await logTime(
      alvo.userId,
      {
        projectId: projetoId,
        workedOn: localDate("2026-08-18"),
        duration: fromHours(3),
        description: "Layout da home",
      },
      AGORA,
    );

    const detalhe = await buildProjectDetail(alvo.userId, projetoId, AGORA);
    assert.equal(detalhe.entries[0]?.rateCents, 12_000);
    assert.equal(detalhe.health.effort.worked, 3_000);
    assert.equal(detalhe.health.effort.billableAmount, 36_000, "3h a R$ 120,00");
  });

  it("recusa trabalho registrado no futuro", async () => {
    const { logTime } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    await assert.rejects(
      () =>
        logTime(
          alvo.userId,
          {
            projectId: projetoId,
            workedOn: localDate("2026-09-05"),
            duration: fromHours(2),
            description: "Viagem no tempo",
          },
          AGORA,
        ),
      /futuro/,
    );
  });

  it("recusa duração zero", async () => {
    const { logTime } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    await assert.rejects(
      () =>
        logTime(
          alvo.userId,
          {
            projectId: projetoId,
            workedOn: localDate("2026-08-18"),
            duration: fromHours(0),
            description: "Nada",
          },
          AGORA,
        ),
      /quanto tempo levou/,
    );
  });

  it("tempo não cobrável entra no total e fica fora do valor a cobrar", async () => {
    const { logTime, buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    await logTime(
      alvo.userId,
      { projectId: projetoId, workedOn: localDate("2026-08-18"), duration: fromHours(4), description: "Feature" },
      AGORA,
    );
    await logTime(
      alvo.userId,
      {
        projectId: projetoId,
        workedOn: localDate("2026-08-19"),
        duration: fromHours(2),
        description: "Retrabalho",
        billable: false,
      },
      AGORA,
    );

    const { health } = await buildProjectDetail(alvo.userId, projetoId, AGORA);
    assert.equal(health.effort.worked, 6_000);
    assert.equal(health.effort.billableWorked, 4_000);
    assert.equal(health.effort.billableAmount, 48_000);
  });
});

describe("cobrança do projeto", () => {
  beforeEach(() => zerar());

  it("receber cria a receita no razão e move o saldo", async () => {
    const { schedulePayment, receivePayment } = await import("./work.ts");
    const { buildAccountsView } = await import("./accounts.ts");
    const alvo = await ambiente(500_000);
    const { projetoId } = await projetoComCliente(alvo.userId);

    const parcelaId = await schedulePayment(
      alvo.userId,
      {
        projectId: projetoId,
        description: "Entrada (50%)",
        amount: cents(300_000),
        dueOn: localDate("2026-08-15"),
      },
      AGORA,
    );

    const { transactionId } = await receivePayment(
      alvo.userId,
      parcelaId,
      { accountId: alvo.contaId, receivedOn: localDate("2026-08-18") },
      AGORA,
    );

    assert.ok(transactionId, "o recebimento precisa gerar um lançamento");

    const view = await buildAccountsView(alvo.userId, AGORA);
    const conta = view.accounts.find((item) => item.id === alvo.contaId);
    assert.equal(conta?.balanceCents, 800_000, "a receita do projeto entra no saldo");
  });

  it("a receita gerada aparece no extrato com o nome do projeto", async () => {
    const { schedulePayment, receivePayment } = await import("./work.ts");
    const { listTransactions } = await import("../repositories/ledger.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    const parcelaId = await schedulePayment(
      alvo.userId,
      { projectId: projetoId, description: "Entrada", amount: cents(300_000), dueOn: localDate("2026-08-15") },
      AGORA,
    );
    await receivePayment(alvo.userId, parcelaId, { accountId: alvo.contaId }, AGORA);

    const lancamentos = await listTransactions(alvo.userId, { limit: 50 });
    const receita = lancamentos.find((item) => item.kind === "income");

    assert.equal(receita?.description, "Site institucional · Entrada");
  });

  it("não deixa receber a mesma parcela duas vezes", async () => {
    const { schedulePayment, receivePayment } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    const parcelaId = await schedulePayment(
      alvo.userId,
      { projectId: projetoId, description: "Entrada", amount: cents(300_000), dueOn: localDate("2026-08-15") },
      AGORA,
    );

    await receivePayment(alvo.userId, parcelaId, { accountId: alvo.contaId }, AGORA);
    await assert.rejects(
      () => receivePayment(alvo.userId, parcelaId, { accountId: alvo.contaId }, AGORA),
      /já foi recebida/,
    );
  });

  it("separa vencido de a vencer e acusa contrato sem parcela", async () => {
    const { schedulePayment, buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    await schedulePayment(
      alvo.userId,
      { projectId: projetoId, description: "Entrada", amount: cents(200_000), dueOn: localDate("2026-08-10") },
      AGORA,
    );
    await schedulePayment(
      alvo.userId,
      { projectId: projetoId, description: "Entrega", amount: cents(200_000), dueOn: localDate("2026-09-30") },
      AGORA,
    );

    const { health } = await buildProjectDetail(alvo.userId, projetoId, AGORA);

    assert.equal(health.finance.overdue, 200_000);
    assert.equal(health.finance.pending, 200_000);
    // Contrato de 6.000 com 4.000 agendados: 2.000 que ninguém vai cobrar.
    assert.equal(health.finance.unscheduled, 200_000);
  });
});

describe("panorama do trabalho", () => {
  beforeEach(() => zerar());

  it("soma horas da última semana e conta projetos atrasados", async () => {
    const { createProject, logTime, buildWorkOverview } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    // Um projeto com prazo estourado.
    await createProject(
      alvo.userId,
      { name: "Atrasado", dueOn: localDate("2026-08-01") },
      AGORA,
    );

    await logTime(
      alvo.userId,
      { projectId: projetoId, workedOn: localDate("2026-08-18"), duration: fromHours(5), description: "A" },
      AGORA,
    );
    // Fora da janela de sete dias: não pode entrar no total da semana.
    await logTime(
      alvo.userId,
      { projectId: projetoId, workedOn: localDate("2026-08-01"), duration: fromHours(8), description: "B" },
      AGORA,
    );

    const panorama = await buildWorkOverview(alvo.userId, AGORA);

    assert.equal(panorama.totals.weekMilli, 5_000, "só as horas dos últimos sete dias");
    assert.equal(panorama.totals.lateProjects, 1);
    assert.equal(panorama.totals.contractedCents, 600_000);
  });

  it("o painel de um não enxerga projeto do outro", async () => {
    const { buildWorkOverview } = await import("./work.ts");
    const { signUp } = await import("./auth.ts");
    const alvo = await ambiente();
    await projetoComCliente(alvo.userId);

    const { user: outro } = await signUp({
      email: "terceiro@fluxo.app",
      password: "senha-do-terceiro-123",
      displayName: "Terceiro",
    });

    const panorama = await buildWorkOverview(outro.id, AGORA);
    assert.equal(panorama.projects.length, 0);
  });
});

describe("tarefas", () => {
  beforeEach(() => zerar());

  it("suporte nasce não cobrável; funcionalidade nasce cobrável", async () => {
    const { createTask, buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    await createTask(alvo.userId, { projectId: projetoId, title: "Corrigir envio", kind: "support" }, AGORA);
    await createTask(alvo.userId, { projectId: projetoId, title: "Nova página", kind: "feature" }, AGORA);

    const { tasks } = await buildProjectDetail(alvo.userId, projetoId, AGORA);
    const suporte = tasks.find((tarefa) => tarefa.kind === "support");
    const feature = tasks.find((tarefa) => tarefa.kind === "feature");

    assert.equal(suporte?.billable, false, "consertar o que deveria funcionar não se cobra por padrão");
    assert.equal(feature?.billable, true);
  });

  it("a decisão explícita vence o padrão do tipo", async () => {
    const { createTask, buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    await createTask(
      alvo.userId,
      { projectId: projetoId, title: "Suporte contratado", kind: "support", billable: true },
      AGORA,
    );

    const { tasks } = await buildProjectDetail(alvo.userId, projetoId, AGORA);
    assert.equal(tasks[0]?.billable, true);
  });

  it("concluir carimba a data", async () => {
    const { createTask, setTaskStatus, buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    const tarefaId = await createTask(alvo.userId, { projectId: projetoId, title: "Ajuste" }, AGORA);
    await setTaskStatus(alvo.userId, tarefaId, "done", AGORA);

    const { tasks } = await buildProjectDetail(alvo.userId, projetoId, AGORA);
    assert.equal(tasks[0]?.status, "done");
    assert.ok(tasks[0]?.completedAt, "a conclusão precisa registrar quando aconteceu");
  });

  it("não cria tarefa em projeto de outra pessoa", async () => {
    const { createTask } = await import("./work.ts");
    const { signUp } = await import("./auth.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    const { user: intruso } = await signUp({
      email: "intruso-dev@fluxo.app",
      password: "senha-do-intruso-123",
      displayName: "Intruso",
    });

    await assert.rejects(
      () => createTask(intruso.id, { projectId: projetoId, title: "Invasão" }, AGORA),
      /Projeto/,
    );
  });
});

describe("propostas", () => {
  beforeEach(() => zerar());

  it("aceitar preenche o contrato quando ele está zerado", async () => {
    const { createProject, createProposal, decideProposal, buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente();

    // Projeto sem contrato: é o caso em que a proposta define o valor.
    const projetoId = await createProject(alvo.userId, { name: "App do salão" }, AGORA);
    const propostaId = await createProposal(
      alvo.userId,
      { projectId: projetoId, title: "Escopo fechado", amount: cents(450_000) },
      AGORA,
    );

    await decideProposal(alvo.userId, propostaId, "accepted", AGORA);

    const detalhe = await buildProjectDetail(alvo.userId, projetoId, AGORA);
    assert.equal(detalhe.health.finance.contracted, 450_000);
    assert.ok(
      detalhe.events.some((evento) => evento.kind === "proposal"),
      "aceitar precisa aparecer no histórico",
    );
  });

  it("não sobrescreve contrato já combinado", async () => {
    const { createProposal, decideProposal, buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComCliente(alvo.userId);

    const propostaId = await createProposal(
      alvo.userId,
      { projectId: projetoId, title: "Proposta revisada", amount: cents(900_000) },
      AGORA,
    );
    await decideProposal(alvo.userId, propostaId, "accepted", AGORA);

    const detalhe = await buildProjectDetail(alvo.userId, projetoId, AGORA);
    assert.equal(
      detalhe.health.finance.contracted,
      600_000,
      "mexer em dinheiro já combinado precisa ser decisão explícita",
    );
  });

  it("recusar não mexe no contrato", async () => {
    const { createProject, createProposal, decideProposal, buildProjectDetail } = await import("./work.ts");
    const alvo = await ambiente();

    const projetoId = await createProject(alvo.userId, { name: "Orçamento perdido" }, AGORA);
    const propostaId = await createProposal(
      alvo.userId,
      { projectId: projetoId, title: "Proposta", amount: cents(450_000) },
      AGORA,
    );

    await decideProposal(alvo.userId, propostaId, "rejected", AGORA);

    const detalhe = await buildProjectDetail(alvo.userId, projetoId, AGORA);
    assert.equal(detalhe.health.finance.contracted, 0);
    assert.equal(detalhe.proposals[0]?.status, "rejected");
  });
});
