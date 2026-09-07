/**
 * Validade do aparelho conectado.
 *
 * A regra mudou de prazo fixo para janela de inatividade, e as duas se parecem
 * até o dia em que divergem: com prazo fixo, quem usa o aplicativo todo dia era
 * desconectado no sexto mês sem motivo nenhum, e um aparelho perdido continuava
 * válido meio ano. Estes testes fixam o comportamento novo nos dois extremos.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { ambiente, zerar } from "../testing/cenario.ts";

const DIA = 86_400_000;

describe("validade do aparelho", () => {
  beforeEach(() => zerar());

  it("o uso empurra a validade para trinta dias à frente", async () => {
    const { issueSession, resolveSession, DEVICE_SESSION_DAYS } = await import("./session.ts");
    const alvo = await ambiente();

    const inicio = new Date("2026-01-01T12:00:00.000Z");
    const sessao = await issueSession({ userId: alvo.userId, kind: "device", now: inicio });
    assert.equal(DEVICE_SESSION_DAYS, 30);

    // Vinte dias depois ele abre o aplicativo.
    const usoTardio = new Date(inicio.getTime() + 20 * DIA);
    assert.ok(await resolveSession(sessao.token, usoTardio), "ainda dentro da janela");

    // Quarenta dias depois do início — mas só vinte do último uso.
    const depois = new Date(inicio.getTime() + 40 * DIA);
    assert.ok(await resolveSession(sessao.token, depois), "o uso renovou a janela");
  });

  it("um mês sem abrir o aplicativo derruba a sessão", async () => {
    const { issueSession, resolveSession } = await import("./session.ts");
    const alvo = await ambiente();

    const inicio = new Date("2026-01-01T12:00:00.000Z");
    const sessao = await issueSession({ userId: alvo.userId, kind: "device", now: inicio });

    const passadoODia = new Date(inicio.getTime() + 31 * DIA);
    assert.equal(await resolveSession(sessao.token, passadoODia), null);
  });

  it("a sessão de navegador não é renovada pelo uso", async () => {
    // Trinta dias contados da entrada, e ponto: quem usa o site tem a senha à
    // mão e reentrar custa pouco. Renovar sem limite deixaria um navegador
    // público autenticado para sempre.
    const { issueSession, resolveSession } = await import("./session.ts");
    const alvo = await ambiente();

    const inicio = new Date("2026-01-01T12:00:00.000Z");
    const sessao = await issueSession({ userId: alvo.userId, kind: "web", now: inicio });

    assert.ok(await resolveSession(sessao.token, new Date(inicio.getTime() + 20 * DIA)));
    assert.equal(await resolveSession(sessao.token, new Date(inicio.getTime() + 31 * DIA)), null);
  });
});
