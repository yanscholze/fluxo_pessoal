import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

describe("fechamento não é vencimento", () => {
  beforeEach(() => zerar());

  it("mantém fatura e parcela abertas até o vencimento, sem reduzir a dívida", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { buildCardsView } = await import("./cards.ts");
    const { buildInstallmentsView } = await import("./installments.ts");
    const owner = await ambiente();
    await recordTransaction(owner.userId, { kind: "expense", description: "Compra parcelada", amount: cents(30_000), occurredOn: localDate("2026-08-05"), cardId: owner.cartaoId, categoryId: owner.categoriaId, state: "confirmed", installmentCount: 3 });
    for (const day of ["2026-08-14", "2026-08-20"]) {
      const now = new Date(`${day}T12:00:00Z`);
      const cards = await buildCardsView(owner.userId, now);
      const invoice = cards.cards[0].invoices.find((item) => item.competence === "2026-08");
      assert.equal(invoice?.status, "em_aberto");
      assert.equal(invoice?.outstandingCents, 10_000);
      const installments = await buildInstallmentsView(owner.userId, now);
      assert.equal(installments.active[0].overdueCount, 0);
      assert.equal(installments.active[0].entries[0].status, "open");
      assert.equal(installments.active[0].paidAmount, 0);
      assert.equal(installments.active[0].openAmount, 30_000);
    }
    const after = new Date("2026-08-21T12:00:00Z");
    const cards = await buildCardsView(owner.userId, after);
    assert.equal(cards.cards[0].invoices.find((item) => item.competence === "2026-08")?.status, "atrasada");
    const installments = await buildInstallmentsView(owner.userId, after);
    assert.equal(installments.active[0].overdueCount, 1);
    assert.equal(installments.active[0].entries[0].status, "overdue");
    assert.equal(installments.active[0].openAmount, 30_000);
  });
});
