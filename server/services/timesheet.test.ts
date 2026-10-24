/**
 * Horas trabalhadas, contra o banco.
 *
 * O que precisa ficar preso aqui é o que a tela promete e ninguém confere: o
 * valor/hora efetivo sai da receita **recebida** dividida pelo tempo, e não de
 * um preço guardado no lançamento; e corrigir ou apagar uma sessão refaz todas
 * as contas. Se o segundo falhar, o relatório de um projeto entregue nunca
 * fecha com o que aconteceu.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { fromMinutes } from "../../core/domain/work/hours.ts";
import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-09-10T12:00:00Z");

/** Um projeto de R$ 6.000 com uma parcela de R$ 3.000 já recebida. */
async function projetoComReceita(userId: string, contaId: string) {
  const { createClient, createProject, schedulePayment, receivePayment } = await import("./work.ts");

  const clienteId = await createClient(userId, { name: "Padaria do Bairro" }, AGORA);
  const projetoId = await createProject(
    userId,
    {
      name: "Site institucional",
      clientId: clienteId,
      contract: cents(600_000),
      hourlyRate: cents(12_000),
    },
    AGORA,
  );
  const parcelaId = await schedulePayment(
    userId,
    {
      projectId: projetoId,
      description: "Entrada",
      amount: cents(300_000),
      dueOn: localDate("2026-09-05"),
    },
    AGORA,
  );
  await receivePayment(userId, parcelaId, { accountId: contaId, receivedOn: localDate("2026-09-05") }, AGORA);

  return { projetoId };
}

describe("registro de horas", () => {
  beforeEach(() => {
    zerar();
  });

  it("a sessão guarda a categoria, e o relatório divide o tempo por ela", async () => {
    const { logTime, buildTimesheetReport } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComReceita(alvo.userId, alvo.contaId);

    for (const [categoria, minutos] of [
      ["development", 300],
      ["bugs", 120],
      ["meeting", 60],
    ] as const) {
      await logTime(
        alvo.userId,
        {
          projectId: projetoId,
          workedOn: localDate("2026-09-08"),
          duration: fromMinutes(minutos),
          description: `Sessão de ${categoria}`,
          activity: categoria,
        },
        AGORA,
      );
    }

    const relatorio = await buildTimesheetReport(alvo.userId, projetoId, AGORA);
    const projeto = relatorio.projects[0];

    assert.equal(projeto.summary.worked, 8_000, "5h + 2h + 1h");
    assert.deepEqual(
      projeto.summary.byActivity.map((linha) => [linha.activity, linha.worked]),
      [
        ["development", 5_000],
        ["bugs", 2_000],
        ["meeting", 1_000],
      ],
    );

    const soma = projeto.summary.byActivity.reduce((total, linha) => total + linha.percent, 0);
    assert.ok(Math.abs(soma - 100) < 0.0001, "os percentuais precisam fechar em cem");
  });

  it("o valor/hora efetivo sai da receita recebida, não do preço combinado", async () => {
    const { logTime, buildTimesheetReport } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComReceita(alvo.userId, alvo.contaId);

    // 20h de trabalho para R$ 3.000 recebidos: R$ 150,00/h. O valor/hora
    // combinado no projeto é R$ 120,00 e não entra nesta conta.
    await logTime(
      alvo.userId,
      {
        projectId: projetoId,
        workedOn: localDate("2026-09-08"),
        duration: fromMinutes(20 * 60),
        description: "Desenvolvimento",
      },
      AGORA,
    );

    const relatorio = await buildTimesheetReport(alvo.userId, projetoId, AGORA);

    assert.equal(relatorio.projects[0].summary.revenue, 300_000);
    assert.equal(relatorio.projects[0].summary.effectiveRate, 15_000);
    assert.equal(relatorio.totals.effectiveRateCents, 15_000);
  });

  it("receber mais dinheiro muda o valor/hora sem tocar em lançamento nenhum", async () => {
    const { logTime, schedulePayment, receivePayment, buildTimesheetReport } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComReceita(alvo.userId, alvo.contaId);

    await logTime(
      alvo.userId,
      {
        projectId: projetoId,
        workedOn: localDate("2026-09-08"),
        duration: fromMinutes(20 * 60),
        description: "Desenvolvimento",
      },
      AGORA,
    );

    const antes = await buildTimesheetReport(alvo.userId, projetoId, AGORA);
    assert.equal(antes.projects[0].summary.effectiveRate, 15_000);

    // A segunda parcela entra. É o que o congelamento do preço na sessão
    // impedia de acontecer: o número tem de mudar, porque o projeto rendeu mais.
    const segunda = await schedulePayment(
      alvo.userId,
      {
        projectId: projetoId,
        description: "Entrega",
        amount: cents(300_000),
        dueOn: localDate("2026-09-09"),
      },
      AGORA,
    );
    await receivePayment(
      alvo.userId,
      segunda,
      { accountId: alvo.contaId, receivedOn: localDate("2026-09-09") },
      AGORA,
    );

    const depois = await buildTimesheetReport(alvo.userId, projetoId, AGORA);
    assert.equal(depois.projects[0].summary.revenue, 600_000);
    assert.equal(depois.projects[0].summary.effectiveRate, 30_000, "R$ 6.000 por 20h");
  });

  it("corrigir a sessão refaz o total, a categoria e o valor/hora", async () => {
    const { logTime, updateTimeEntry, buildTimesheetReport } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComReceita(alvo.userId, alvo.contaId);

    const sessaoId = await logTime(
      alvo.userId,
      {
        projectId: projetoId,
        workedOn: localDate("2026-09-08"),
        duration: fromMinutes(120),
        description: "Duas horas, de memória",
        activity: "development",
      },
      AGORA,
    );

    await updateTimeEntry(
      alvo.userId,
      sessaoId,
      { duration: fromMinutes(180), activity: "bugs", description: "Eram três, e era bug" },
      AGORA,
    );

    const relatorio = await buildTimesheetReport(alvo.userId, projetoId, AGORA);
    const projeto = relatorio.projects[0];

    assert.equal(projeto.summary.worked, 3_000);
    assert.equal(projeto.summary.byActivity[0].activity, "bugs");
    assert.equal(projeto.summary.effectiveRate, 100_000, "R$ 3.000 por 3h");
    assert.equal(relatorio.sessions[0].description, "Eram três, e era bug");
  });

  it("apagar a sessão tira o tempo dela de todas as contas", async () => {
    const { logTime, removeTimeEntry, buildTimesheetReport } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComReceita(alvo.userId, alvo.contaId);

    await logTime(
      alvo.userId,
      {
        projectId: projetoId,
        workedOn: localDate("2026-09-08"),
        duration: fromMinutes(600),
        description: "Fica",
      },
      AGORA,
    );
    const engano = await logTime(
      alvo.userId,
      {
        projectId: projetoId,
        workedOn: localDate("2026-09-08"),
        duration: fromMinutes(600),
        description: "Lançada duas vezes por engano",
      },
      AGORA,
    );

    assert.equal(await removeTimeEntry(alvo.userId, engano), true);

    const relatorio = await buildTimesheetReport(alvo.userId, projetoId, AGORA);
    assert.equal(relatorio.projects[0].summary.worked, 10_000, "sobra só a sessão que fica");
    assert.equal(relatorio.projects[0].summary.sessions, 1);
    assert.equal(relatorio.projects[0].summary.effectiveRate, 30_000, "R$ 3.000 por 10h");

    // Segunda chamada não é erro: o botão pode ser clicado duas vezes.
    assert.equal(await removeTimeEntry(alvo.userId, engano), false);
  });

  it("a sessão não cobrável conta no tempo e derruba o valor/hora", async () => {
    const { logTime, buildTimesheetReport } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComReceita(alvo.userId, alvo.contaId);

    await logTime(
      alvo.userId,
      {
        projectId: projetoId,
        workedOn: localDate("2026-09-08"),
        duration: fromMinutes(600),
        description: "Cobrável",
      },
      AGORA,
    );
    await logTime(
      alvo.userId,
      {
        projectId: projetoId,
        workedOn: localDate("2026-09-09"),
        duration: fromMinutes(300),
        description: "Retrabalho por conta da casa",
        activity: "bugs",
        billable: false,
      },
      AGORA,
    );

    const relatorio = await buildTimesheetReport(alvo.userId, projetoId, AGORA);
    const projeto = relatorio.projects[0];

    assert.equal(projeto.summary.worked, 15_000);
    assert.equal(projeto.summary.billableWorked, 10_000);
    // R$ 3.000 por 15h dão R$ 200,00/h — e não os R$ 300,00 que sairiam se o
    // retrabalho não cobrado fosse tirado do divisor.
    assert.equal(projeto.summary.effectiveRate, 20_000);
  });

  it("a média por projeto ignora quem não tem hora lançada", async () => {
    const { createProject, logTime, buildTimesheetReport } = await import("./work.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComReceita(alvo.userId, alvo.contaId);

    const segundo = await createProject(alvo.userId, { name: "Landing page" }, AGORA);
    await createProject(alvo.userId, { name: "Nunca começou" }, AGORA);

    await logTime(
      alvo.userId,
      { projectId: projetoId, workedOn: localDate("2026-09-08"), duration: fromMinutes(600), description: "A" },
      AGORA,
    );
    await logTime(
      alvo.userId,
      { projectId: segundo, workedOn: localDate("2026-09-08"), duration: fromMinutes(1_200), description: "B" },
      AGORA,
    );

    const relatorio = await buildTimesheetReport(alvo.userId, undefined, AGORA);

    assert.equal(relatorio.projects.length, 2, "o projeto sem horas não entra no relatório");
    assert.equal(relatorio.totals.worked, 30_000);
    assert.equal(relatorio.totals.averageHoursPerProject, 15, "30h em dois projetos");
  });

  it("o relatório de um usuário não enxerga as horas de outro", async () => {
    const { logTime, buildTimesheetReport, updateTimeEntry, removeTimeEntry } = await import("./work.ts");
    const { signUp } = await import("./auth.ts");
    const alvo = await ambiente();
    const { projetoId } = await projetoComReceita(alvo.userId, alvo.contaId);

    const sessaoId = await logTime(
      alvo.userId,
      { projectId: projetoId, workedOn: localDate("2026-09-08"), duration: fromMinutes(60), description: "Minha" },
      AGORA,
    );

    const { user: outro } = await signUp({
      email: "outro@fluxo.app",
      password: "senha-de-teste-123",
      displayName: "Outra Pessoa",
    });

    const dele = await buildTimesheetReport(outro.id, undefined, AGORA);
    assert.equal(dele.totals.sessions, 0);
    assert.equal(dele.totals.effectiveRateCents, null);

    await assert.rejects(() => updateTimeEntry(outro.id, sessaoId, { duration: fromMinutes(1) }, AGORA));
    assert.equal(await removeTimeEntry(outro.id, sessaoId), false);
  });
});

describe("situação do projeto", () => {
  beforeEach(() => {
    zerar();
  });

  it("concluir carimba a entrega e tira o projeto dos abertos", async () => {
    const { createProject, updateProjectStatus, buildWorkOverview } = await import("./work.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    const projetoId = await createProject(
      alvo.userId,
      { name: "Site institucional", contract: cents(600_000), dueOn: localDate("2026-09-30") },
      AGORA,
    );

    const antes = await buildDashboard(alvo.userId, AGORA);
    assert.equal(antes.openProjects.length, 1);

    await updateProjectStatus(alvo.userId, projetoId, "done", AGORA);

    const painel = await buildDashboard(alvo.userId, AGORA);
    assert.equal(painel.openProjects.length, 0, "encerrado é histórico, e histórico não é painel");

    const carteira = await buildWorkOverview(alvo.userId, AGORA);
    assert.equal(carteira.totals.activeProjects, 0);
    // Encerrar sem ter marcado a entrega carimba a data: sem ela o prazo
    // ficaria em aberto para sempre.
    assert.equal(carteira.projects[0].health.deadline.status, "entregue");
  });

  it("voltar para uma fase de trabalho apaga a data de entrega", async () => {
    const { createProject, updateProjectStatus, buildWorkOverview } = await import("./work.ts");
    const alvo = await ambiente();

    // Prazo no passado: se a entrega for esquecida, o projeto tem de voltar a
    // aparecer como atrasado.
    const projetoId = await createProject(
      alvo.userId,
      { name: "Site institucional", dueOn: localDate("2026-09-01") },
      AGORA,
    );

    await updateProjectStatus(alvo.userId, projetoId, "delivered", AGORA);
    const entregue = await buildWorkOverview(alvo.userId, AGORA);
    assert.equal(entregue.projects[0].health.deadline.status, "entregue");

    await updateProjectStatus(alvo.userId, projetoId, "adjustments", AGORA);
    const emAjustes = await buildWorkOverview(alvo.userId, AGORA);
    assert.equal(
      emAjustes.projects[0].health.deadline.status,
      "atrasado",
      "o prazo volta a ser cobrado quando o trabalho volta",
    );
  });

  it("as novas fases contam como projeto aberto", async () => {
    const { createProject, updateProjectStatus } = await import("./work.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    const projetoId = await createProject(alvo.userId, { name: "Site institucional" }, AGORA);

    for (const fase of ["testing", "adjustments", "delivered"] as const) {
      await updateProjectStatus(alvo.userId, projetoId, fase, AGORA);
      const painel = await buildDashboard(alvo.userId, AGORA);
      assert.equal(painel.openProjects.length, 1, `${fase} precisa continuar aberto`);
      assert.equal(painel.openProjects[0].status, fase);
    }
  });
});
