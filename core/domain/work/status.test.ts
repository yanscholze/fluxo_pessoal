/**
 * A situação do projeto.
 *
 * A régua de "aberto" existia em três listas divergentes — o KPI contava três e
 * a tela mostrava cinco. O teste que importa é o que prende as duas pontas:
 * aberto e encerrado precisam ser complementares, sem sobra nem sobreposição.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isClosedStatus,
  isOpenStatus,
  nextPhase,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUSES,
  toProjectStatus,
  WORK_PHASES,
} from "./status.ts";

describe("situação do projeto", () => {
  it("toda situação é aberta ou encerrada, nunca as duas nem nenhuma", () => {
    for (const situacao of PROJECT_STATUSES) {
      assert.notEqual(
        isOpenStatus(situacao),
        isClosedStatus(situacao),
        `${situacao} precisa cair de um lado só`,
      );
    }
  });

  it("entregue ainda é aberto: encerrar é uma decisão, não consequência de entregar", () => {
    // Entre entregar e encerrar existe o período em que se conserta o que o
    // cliente encontrou — e é ele que consome as horas que ninguém orçou.
    assert.equal(isOpenStatus("delivered"), true);
    assert.equal(isOpenStatus("support"), true);
    assert.equal(isClosedStatus("done"), true);
    assert.equal(isClosedStatus("cancelled"), true);
  });

  it("as quatro fases do trabalho avançam em ordem e param em entregue", () => {
    assert.deepEqual([...WORK_PHASES], ["active", "testing", "adjustments", "delivered"]);
    assert.equal(nextPhase("active"), "testing");
    assert.equal(nextPhase("testing"), "adjustments");
    assert.equal(nextPhase("adjustments"), "delivered");
    // Depois de entregue vem encerrar, que é outra ação e pede confirmação:
    // avançar por engano até "concluído" tiraria o projeto da tela.
    assert.equal(nextPhase("delivered"), null);
  });

  it("situação fora das fases não tem próxima", () => {
    assert.equal(nextPhase("paused"), null);
    assert.equal(nextPhase("lead"), null);
    assert.equal(nextPhase("qualquer-coisa"), null);
  });

  it("toda situação tem rótulo em português", () => {
    for (const situacao of PROJECT_STATUSES) {
      assert.ok(PROJECT_STATUS_LABEL[situacao], `${situacao} sem rótulo`);
    }
  });

  it("o que vem da borda e não é situação vira desenvolvimento", () => {
    assert.equal(toProjectStatus("testing"), "testing");
    assert.equal(toProjectStatus("inventado"), "active");
    assert.equal(toProjectStatus(null), "active");
    assert.equal(toProjectStatus(undefined), "active");
  });
});
