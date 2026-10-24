/**
 * As pendências no painel inicial.
 *
 * O painel passou a responder "o que falta fazer" junto com "quanto sobra", e
 * o que estes testes fixam é o **recorte** dessa resposta: o que entra, o que
 * fica de fora, e o que nunca pode sumir.
 *
 * O caso que mais importa é o do sétimo projeto. A lista de projetos do painel
 * corta em seis — senão vira uma segunda tela de projetos — e seria natural
 * derivar as tarefas dessa lista já cortada. Seria errado: a pendência do
 * sétimo projeto desapareceria do painel sem nenhum aviso, e o painel diria
 * "nada para hoje" sobre trabalho que existe.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-09-12T12:00:00Z");

describe("pendências no painel", () => {
  beforeEach(() => zerar());

  it("traz as tarefas em aberto dos projetos abertos e deixa as concluídas de fora", async () => {
    const { createProject, createTask, setTaskStatus } = await import("./work.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    const projetoId = await createProject(alvo.userId, { name: "Zonas App" }, AGORA);
    await createTask(alvo.userId, { projectId: projetoId, title: "Terminar as integrações" }, AGORA);
    const feita = await createTask(alvo.userId, { projectId: projetoId, title: "Publicar" }, AGORA);
    await setTaskStatus(alvo.userId, feita, "done", AGORA);

    const painel = await buildDashboard(alvo.userId, AGORA);

    assert.deepEqual(
      painel.openTasks.map((tarefa) => tarefa.title),
      ["Terminar as integrações"],
    );
    assert.equal(painel.openTasks[0].projectName, "Zonas App");
  });

  it("ignora as tarefas de projeto encerrado", async () => {
    const { createProject, createTask, updateProjectStatus } = await import("./work.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    const projetoId = await createProject(alvo.userId, { name: "Site antigo" }, AGORA);
    await createTask(alvo.userId, { projectId: projetoId, title: "Sobrou isto" }, AGORA);
    await updateProjectStatus(alvo.userId, projetoId, "done", AGORA);

    const painel = await buildDashboard(alvo.userId, AGORA);

    assert.equal(painel.openTasks.length, 0);
  });

  it("não perde a pendência do sétimo projeto, que não cabe na lista de projetos", async () => {
    const { createProject, createTask } = await import("./work.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    let ultimo = "";
    for (let numero = 1; numero <= 7; numero += 1) {
      ultimo = await createProject(alvo.userId, { name: `Projeto ${numero}` }, AGORA);
    }
    await createTask(alvo.userId, { projectId: ultimo, title: "A que ninguém veria" }, AGORA);

    const painel = await buildDashboard(alvo.userId, AGORA);

    // A lista de projetos corta em seis; as pendências, não.
    assert.equal(painel.openProjects.length, 6);
    assert.deepEqual(
      painel.openTasks.map((tarefa) => tarefa.title),
      ["A que ninguém veria"],
    );
  });

  it("marca como atrasada a que venceu antes de hoje", async () => {
    const { createProject, createTask } = await import("./work.ts");
    const { localDate } = await import("../../core/time/local-date.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();

    const projetoId = await createProject(alvo.userId, { name: "Zonas App" }, AGORA);
    await createTask(
      alvo.userId,
      { projectId: projetoId, title: "Venceu ontem", dueOn: localDate("2026-09-11") },
      AGORA,
    );
    await createTask(
      alvo.userId,
      { projectId: projetoId, title: "Vence hoje", dueOn: localDate("2026-09-12") },
      AGORA,
    );

    const painel = await buildDashboard(alvo.userId, AGORA);
    const porTitulo = new Map(painel.openTasks.map((tarefa) => [tarefa.title, tarefa]));

    assert.equal(porTitulo.get("Venceu ontem")?.isLate, true);
    // Vencer hoje **não** é atraso: o dia ainda não acabou, e pintar de
    // vermelho o que ainda dá tempo de fazer é o começo de ignorar o vermelho.
    assert.equal(porTitulo.get("Vence hoje")?.isLate, false);
  });
});
