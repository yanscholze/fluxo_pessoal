/**
 * Categoria da sessão de trabalho.
 *
 * A lista é fechada, e este teste é o que impede alguém de acrescentar uma
 * categoria sem rótulo ou sem cor — o gráfico do relatório é lido de relance, e
 * uma fatia cinza sem nome não diz nada.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ACTIVITIES, ACTIVITY_COLOR, ACTIVITY_LABEL, isDelivery, isRework, toActivity } from "./activity.ts";

describe("categoria de trabalho", () => {
  it("toda categoria tem rótulo e cor", () => {
    for (const atividade of ACTIVITIES) {
      assert.ok(ACTIVITY_LABEL[atividade], `${atividade} sem rótulo`);
      assert.match(ACTIVITY_COLOR[atividade], /^#[0-9a-f]{6}$/i, `${atividade} sem cor`);
    }
  });

  it("as cores são distintas, para o gráfico ser legível", () => {
    const cores = new Set(ACTIVITIES.map((atividade) => ACTIVITY_COLOR[atividade]));
    assert.equal(cores.size, ACTIVITIES.length);
  });

  it("retrabalho é conserto do que já deveria funcionar", () => {
    assert.equal(isRework("bugs"), true);
    assert.equal(isRework("support"), true);
    assert.equal(isRework("development"), false);
    assert.equal(isRework("improvements"), false, "melhoria é avanço, não conserto");
  });

  it("reunião e pesquisa são trabalho, mas não produzem entrega", () => {
    assert.equal(isDelivery("meeting"), false);
    assert.equal(isDelivery("research"), false);
    assert.equal(isDelivery("documentation"), false);
    assert.equal(isDelivery("development"), true);
    assert.equal(isDelivery("deploy"), true);
    // Bug é retrabalho e ainda assim entrega: o conserto vai para o cliente.
    assert.equal(isDelivery("bugs"), true);
  });

  it("o que vem da borda e não é categoria vira outros", () => {
    assert.equal(toActivity("deploy"), "deploy");
    assert.equal(toActivity("inventada"), "other");
    assert.equal(toActivity(null), "other");
  });
});
