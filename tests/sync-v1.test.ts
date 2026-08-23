import assert from "node:assert/strict";
import test from "node:test";
import { decideSyncMutation, MAX_SYNC_MUTATIONS, parseSyncRequestV1 } from "../lib/sync-v1.ts";

const transaction = {
  id: "transaction-001",
  description: "Mercado",
  category: "Alimentação",
  account: "Nubank",
  date: "2026-07-18",
  amount: 129.9,
  type: "expense" as const,
  paymentMethod: "credit" as const,
};

function requestWith(mutations: unknown[]) {
  return {
    device: { id: "android-device-001", name: "Galaxy", platform: "android", appVersion: "0.1.0" },
    mutations,
  };
}

function upsert(overrides: Record<string, unknown> = {}) {
  return {
    mutationId: "mutation-001",
    entity: "transaction",
    entityId: transaction.id,
    operation: "upsert",
    baseVersion: 0,
    data: transaction,
    ...overrides,
  };
}

test("aceita um lançamento novo vindo do Android", () => {
  const parsed = parseSyncRequestV1(requestWith([upsert()]));

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.device.platform, "android");
    assert.equal(parsed.value.mutations[0]?.data?.description, "Mercado");
  }
});

test("rejeita quando o ID do lançamento difere do ID da alteração", () => {
  const parsed = parseSyncRequestV1(requestWith([upsert({ entityId: "transaction-002" })]));

  assert.deepEqual(parsed, { ok: false, error: "O lançamento não corresponde ao identificador da alteração" });
});

test("rejeita alterações repetidas dentro do mesmo lote", () => {
  const parsed = parseSyncRequestV1(requestWith([
    upsert(),
    upsert({ entityId: "transaction-002", data: { ...transaction, id: "transaction-002" } }),
  ]));

  assert.deepEqual(parsed, { ok: false, error: "O lote contém alterações repetidas" });
});

test("limita o lote para proteger o serviço e permitir novas tentativas", () => {
  const mutations = Array.from({ length: MAX_SYNC_MUTATIONS + 1 }, (_, index) => upsert({
    mutationId: `mutation-${String(index).padStart(3, "0")}`,
    entityId: `transaction-${String(index).padStart(3, "0")}`,
    data: { ...transaction, id: `transaction-${String(index).padStart(3, "0")}` },
  }));

  const parsed = parseSyncRequestV1(requestWith(mutations));
  assert.deepEqual(parsed, { ok: false, error: `Envie no máximo ${MAX_SYNC_MUTATIONS} alterações por lote` });
});

test("cria a primeira versão e incrementa uma edição válida", () => {
  assert.deepEqual(decideSyncMutation(null, 0, "upsert"), { status: "apply", nextVersion: 1 });
  assert.deepEqual(decideSyncMutation(3, 3, "upsert"), { status: "apply", nextVersion: 4 });
});

test("detecta uma edição baseada em versão antiga", () => {
  assert.deepEqual(decideSyncMutation(4, 3, "upsert"), { status: "conflict", currentVersion: 4 });
});

test("torna exclusões repetidas e de itens ausentes idempotentes", () => {
  assert.deepEqual(decideSyncMutation(null, 0, "delete"), { status: "noop", currentVersion: 0 });
  assert.deepEqual(decideSyncMutation(5, 5, "delete", true), { status: "noop", currentVersion: 5 });
});
