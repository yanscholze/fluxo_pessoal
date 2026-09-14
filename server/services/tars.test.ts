import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { ambiente, zerar } from "../testing/cenario.ts";

const NOW = new Date("2026-09-13T12:00:00Z");
const CSV = "data,descricao,valor\n2026-09-10,Mercado,-120.50";

describe("pendências do TARS", () => {
  beforeEach(() => zerar());

  it("isola usuários e deixa de contar revisões resolvidas", async () => {
    const { readTarsPendingCounts } = await import("./tars.ts");
    const { ingest, buildCapturesView, resolveCapture } = await import("./captures.ts");
    const { startImport, discardBatch } = await import("./imports.ts");
    const { signUp } = await import("./auth.ts");
    const owner = await ambiente();
    const { user: other } = await signUp({ email: "outra@fluxo.teste", password: "senha-de-teste-123", displayName: "Outra pessoa" });
    assert.deepEqual(await readTarsPendingCounts(owner.userId), { captures: 0, imports: 0 });

    await ingest(owner.userId, [{ sourceApp: "com.nu.production", title: "Você recebeu uma transferência", text: "Você recebeu um Pix de R$ 150,00 de Cliente", postedAt: NOW.getTime(), deviceEventId: "tars-capture" }], NOW);
    const batch = await startImport(owner.userId, { filename: "extrato.csv", content: CSV, accountId: owner.contaId }, NOW);
    assert.deepEqual(await readTarsPendingCounts(owner.userId), { captures: 1, imports: 1 });
    assert.deepEqual(await readTarsPendingCounts(other.id), { captures: 0, imports: 0 });

    const view = await buildCapturesView(owner.userId, NOW);
    await resolveCapture(owner.userId, view.pending[0].id, "ignorado");
    await discardBatch(owner.userId, batch.id);
    assert.deepEqual(await readTarsPendingCounts(owner.userId), { captures: 0, imports: 0 });
  });
});
