import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const NOW = new Date("2026-11-05T12:00:00Z");

describe("classificação de conta e Livre para gastar", () => {
  beforeEach(() => zerar());

  it("reclassifica dinheiro de uso diário sem criar lançamentos nem alterar o patrimônio", async () => {
    const { createAccount, createCategory, updateAccount } = await import("./catalog.ts");
    const { recordTransaction } = await import("./transactions.ts");
    const { createRecurrence } = await import("./recurrences.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const { listTransactions, loadLedger } = await import("../repositories/ledger.ts");
    const owner = await ambiente(50_000);
    const accountId = await createAccount(owner.userId, {
      name: "Saldo usado no dia a dia",
      kind: "investment",
      openingBalance: cents(200_000),
      openedOn: localDate("2026-01-01"),
    }, NOW);
    const incomeCategoryId = await createCategory(owner.userId, { name: "Recebimentos", kind: "income" });
    const excludedIncomeId = await createCategory(owner.userId, {
      name: "Entrada excluída", kind: "income", excludeFromFreeToSpend: true,
    });
    const excludedExpenseId = await createCategory(owner.userId, {
      name: "Compra excluída", kind: "expense", excludeFromFreeToSpend: true,
    });

    await recordTransaction(owner.userId, {
      kind: "income", description: "Recebimento confirmado", accountId,
      amount: cents(100_000), categoryId: incomeCategoryId,
      occurredOn: localDate("2026-10-20"), state: "confirmed",
    }, NOW);
    await recordTransaction(owner.userId, {
      kind: "expense", description: "Despesa já paga", accountId,
      amount: cents(20_000), categoryId: owner.categoriaId,
      occurredOn: localDate("2026-10-21"), state: "confirmed",
    }, NOW);
    await recordTransaction(owner.userId, {
      kind: "expense", description: "Compra própria no cartão", cardId: owner.cartaoId,
      amount: cents(40_000), categoryId: owner.categoriaId,
      occurredOn: localDate("2026-11-02"), state: "confirmed",
    }, NOW);
    await recordTransaction(owner.userId, {
      kind: "expense", description: "Compra fora do Livre", cardId: owner.cartaoId,
      amount: cents(50_000), categoryId: excludedExpenseId,
      occurredOn: localDate("2026-11-03"), state: "confirmed",
    }, NOW);
    await recordTransaction(owner.userId, {
      kind: "income", description: "Previsão fora do Livre", accountId,
      amount: cents(90_000), categoryId: excludedIncomeId,
      occurredOn: localDate("2026-11-10"), state: "planned",
    }, NOW);
    await createRecurrence(owner.userId, {
      kind: "income", description: "Próximo recebimento", accountId,
      amount: cents(70_000), categoryId: incomeCategoryId,
      scheduleDay: 9, dayAdjustment: "next", startsOn: localDate("2026-10-01"),
    }, NOW);

    const before = await buildDashboard(owner.userId, NOW);
    const ledgerBefore = await loadLedger(owner.userId);
    const transactionsBefore = await listTransactions(owner.userId);
    assert.equal(before.freeToSpend.amountCents, 10_000);
    assert.equal(before.position.investmentsCents, 280_000);
    assert.equal(before.position.totalAssetsCents, 330_000);

    await updateAccount(owner.userId, accountId, { kind: "checking" }, NOW);

    const after = await buildDashboard(owner.userId, NOW);
    assert.equal(after.accounts.find((account) => account.id === accountId)?.balanceCents, 280_000);
    assert.equal(after.freeToSpend.liquidBalanceCents, 330_000, "usa o saldo real, incluindo o histórico existente");
    assert.equal(after.freeToSpend.pendingIncomeCents, 70_000, "a recorrência entra uma vez; a previsão excluída não entra");
    assert.equal(after.freeToSpend.openInvoicesCents, 40_000, "a compra excluída continua fora da fatura considerada no Livre");
    assert.equal(after.freeToSpend.otherCommitmentsCents, 0);
    assert.equal(after.freeToSpend.amountCents, 360_000);
    assert.equal(after.position.investmentsCents, 0);
    assert.equal(after.position.totalAssetsCents, before.position.totalAssetsCents);
    assert.equal(after.position.netWorthCents, before.position.netWorthCents);
    assert.deepEqual(await loadLedger(owner.userId), ledgerBefore, "reclassificar não move dinheiro");
    assert.deepEqual(await listTransactions(owner.userId), transactionsBefore, "não gera ajustes de saldo nem duplica recebimentos");

    await updateAccount(owner.userId, accountId, { kind: "investment" }, NOW);
    const restored = await buildDashboard(owner.userId, NOW);
    assert.deepEqual(restored.freeToSpend, before.freeToSpend, "voltar à reserva retira saldo e previsão da folga");
    assert.deepEqual(restored.position, before.position);
    assert.deepEqual(await loadLedger(owner.userId), ledgerBefore);
    assert.deepEqual(await listTransactions(owner.userId), transactionsBefore);
  });

  it("preserva a escolha de excluir uma conta dos totais ao mudar seu tipo", async () => {
    const { createAccount, updateAccount } = await import("./catalog.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const owner = await ambiente(50_000);
    const accountId = await createAccount(owner.userId, {
      name: "Conta apenas para anotação", kind: "investment",
      openingBalance: cents(200_000), includeInTotals: false,
    }, NOW);
    const before = await buildDashboard(owner.userId, NOW);

    await updateAccount(owner.userId, accountId, { kind: "checking" }, NOW);

    const after = await buildDashboard(owner.userId, NOW);
    assert.equal(after.accounts.find((account) => account.id === accountId)?.includeInTotals, false);
    assert.deepEqual(after.freeToSpend, before.freeToSpend);
    assert.deepEqual(after.position, before.position);
  });

  it("não permite reclassificar uma conta pertencente a outro usuário", async () => {
    const { signUp } = await import("./auth.ts");
    const { createAccount, updateAccount } = await import("./catalog.ts");
    const { findAccount } = await import("../repositories/catalog.ts");
    const owner = await ambiente();
    const { user: other } = await signUp({
      email: "classificacao-outro@fluxo.app", password: "senha-ficticia-123",
      displayName: "Outra Pessoa",
    });
    const accountId = await createAccount(owner.userId, {
      name: "Conta do proprietário", kind: "investment", openingBalance: cents(200_000),
    }, NOW);
    const before = await findAccount(owner.userId, accountId);

    await assert.rejects(() => updateAccount(other.id, accountId, { kind: "checking" }, NOW), /Conta/);

    assert.deepEqual(await findAccount(owner.userId, accountId), before);
    assert.equal(await findAccount(other.id, accountId), null);
  });
});
