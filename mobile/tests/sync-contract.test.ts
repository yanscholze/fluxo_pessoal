import assert from "node:assert/strict";
import test from "node:test";
import { actionForSyncResult, coalescedBaseVersion, shouldRemoveFromOutbox } from "../src/sync-contract.ts";

const base = { mutationId: "mutation-001", entity: "transaction" as const, entityId: "transaction-001" };

test("aceita confirmações e reenvios sem duplicar a alteração", () => {
  assert.equal(actionForSyncResult({ ...base, status: "applied" }), "accept-server");
  assert.equal(actionForSyncResult({ ...base, status: "duplicate" }), "accept-server");
  assert.equal(shouldRemoveFromOutbox({ ...base, status: "duplicate" }), true);
});

test("guarda conflitos e rejeições para revisão", () => {
  assert.equal(actionForSyncResult({ ...base, status: "conflict" }), "record-conflict");
  assert.equal(actionForSyncResult({ ...base, status: "rejected" }), "record-rejection");
});

test("edições offline sucessivas preservam a primeira versão-base", () => {
  assert.equal(coalescedBaseVersion(3, 4), 3);
  assert.equal(coalescedBaseVersion(null, 4), 4);
});
