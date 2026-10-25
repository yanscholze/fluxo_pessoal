import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deliveryKey, notificationScope, pendingDeliveries } from "../src/notifications/notification-state.ts";

const notice = { key: "fatura:v1", id: "notice1", revision: 1, severity: "urgente", category: "critical", priority: 5, readAt: null, resolvedAt: null };

describe("entrega de avisos", () => {
  it("separa memória por usuário e servidor sem usar o token", () => {
    const first = notificationScope({ baseUrl: "https://fluxo.app", user: { id: "one" } });
    assert.notEqual(first, notificationScope({ baseUrl: "https://fluxo.app", user: { id: "two" } }));
    assert.notEqual(first, notificationScope({ baseUrl: "https://other.app", user: { id: "one" } }));
    assert.equal(first, notificationScope({ baseUrl: "https://fluxo.app/", user: { id: "one" } }));
    assert.match(first, /^[A-Za-z0-9._-]+$/u);
  });
  it("não reentrega a mesma revisão e permite escalada", () => {
    assert.equal(pendingDeliveries([notice], [deliveryKey(notice)]).length, 0);
    assert.equal(pendingDeliveries([{ ...notice, revision: 2 }], [deliveryKey(notice)]).length, 1);
  });
  it("lidas, resolvidas e insights não interrompem", () => {
    assert.equal(pendingDeliveries([
      { ...notice, readAt: "2026-01-01" }, { ...notice, resolvedAt: "2026-01-01" },
      { ...notice, category: "insight" }, { ...notice, category: "opportunity" }, { ...notice, category: "reminder" },
    ], []).length, 0);
  });
  it("limita a entrega de uma rodada às três prioridades maiores", () => {
    const notifications = [1, 5, 2, 4, 3].map((priority) => ({ ...notice, id: `notice${priority}`, priority }));
    assert.deepEqual(pendingDeliveries(notifications, []).map((item) => item.priority), [5, 4, 3]);
  });
  it("mantém a chave de alertas antigos sem id", () => {
    assert.equal(deliveryKey({ key: "legado", severity: "urgente" }), "legado");
    assert.equal(pendingDeliveries([{ key: "legado", severity: "urgente" }], []).length, 1);
  });
});
