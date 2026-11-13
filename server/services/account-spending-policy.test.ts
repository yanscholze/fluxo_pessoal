import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { SYNC_PROTOCOL_VERSION } from "../../core/domain/sync/protocol.ts";
import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const NOW = new Date("2026-11-05T12:00:00Z");

describe("participação explícita das contas", () => {
  beforeEach(() => zerar());

  it("separa disponível e reserva pela escolha do usuário sem duplicar patrimônio", async () => {
    const { createAccount, updateAccount } = await import("./catalog.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const { buildHealthView } = await import("./health.ts");
    const { buildAccountsView } = await import("./accounts.ts");
    const owner = await ambiente(50_000);
    const investment = await createAccount(owner.userId, {
      name: "Investimento de uso diário", kind: "investment", openingBalance: cents(200_000),
      includeInFreeToSpend: true, openedOn: localDate("2026-01-01"),
    }, NOW);
    const reserve = await createAccount(owner.userId, {
      name: "Reserva em conta corrente", kind: "checking", openingBalance: cents(300_000),
      includeInFreeToSpend: false, openedOn: localDate("2026-01-01"),
    }, NOW);
    await createAccount(owner.userId, {
      name: "Anotação fora dos totais", kind: "savings", openingBalance: cents(900_000),
      includeInTotals: false, includeInFreeToSpend: false,
    }, NOW);
    await createAccount(owner.userId, {
      name: "Reserva estrangeira", kind: "investment", currency: "USD", openingBalance: cents(70_000),
      includeInFreeToSpend: false,
    }, NOW);

    const dashboard = await buildDashboard(owner.userId, NOW);
    const health = await buildHealthView(owner.userId, NOW);
    const accounts = await buildAccountsView(owner.userId, NOW);
    assert.equal(dashboard.freeToSpend.liquidBalanceCents, 250_000);
    assert.equal(dashboard.position.totalAssetsCents, 550_000);
    assert.equal(dashboard.position.investmentsCents, 300_000);
    assert.equal(health.reserve.currentCents, 300_000, "daily-use investment is not also an emergency reserve");
    assert.equal(health.netWorthCents, dashboard.position.netWorthCents);
    assert.equal(accounts.totals.spendableCents, 250_000);
    assert.equal(accounts.totals.investedCents, 300_000);
    assert.equal(accounts.totals.totalCents, 550_000);

    await updateAccount(owner.userId, investment, { includeInFreeToSpend: false }, NOW);
    await updateAccount(owner.userId, reserve, { includeInFreeToSpend: true }, NOW);
    const swapped = await buildDashboard(owner.userId, NOW);
    assert.equal(swapped.accounts.find((account) => account.id === investment)?.kind, "investment");
    assert.equal(swapped.accounts.find((account) => account.id === reserve)?.kind, "checking");
    assert.equal(swapped.freeToSpend.liquidBalanceCents, 350_000);
    assert.equal(swapped.position.investmentsCents, 200_000);
    assert.equal(swapped.position.totalAssetsCents, dashboard.position.totalAssetsCents);
    assert.equal(swapped.position.netWorthCents, dashboard.position.netWorthCents);
    assert.equal((await buildHealthView(owner.userId, NOW)).reserve.currentCents, 200_000);
  });

  it("sincroniza true e false explicitamente e reenvia a mudança pelo catálogo incremental", async () => {
    const { createAccount, updateAccount } = await import("./catalog.ts");
    const { signUp } = await import("./auth.ts");
    const { synchronize } = await import("./sync.ts");
    const owner = await ambiente();
    const included = await createAccount(owner.userId, {
      name: "Investimento incluído", kind: "investment", includeInFreeToSpend: true,
    }, NOW);
    const excluded = await createAccount(owner.userId, {
      name: "Conta corrente excluída", kind: "checking", includeInFreeToSpend: false,
    }, NOW);
    const { user: other } = await signUp({
      email: "spending-policy-other@fluxo.test", password: "fictitious-password-123", displayName: "Other Owner",
    });
    const foreign = await createAccount(other.id, {
      name: "Outra pessoa", kind: "checking", includeInFreeToSpend: true,
    }, NOW);
    const request = { protocolVersion: SYNC_PROTOCOL_VERSION, device: { id: "policy-test-device" }, mutations: [] };
    const initial = await synchronize(owner.userId, request, NOW);
    assert.equal(initial.catalog?.accounts.find((account) => account.id === included)?.includeInFreeToSpend, true);
    assert.equal(initial.catalog?.accounts.find((account) => account.id === excluded)?.includeInFreeToSpend, false);
    assert.ok(!initial.catalog?.accounts.some((account) => account.id === foreign));

    const cursor = { updatedAt: new Date(Date.now() + 60_000).toISOString(), id: "policy-cursor" };
    assert.equal((await synchronize(owner.userId, { ...request, cursor }, NOW)).catalog, null);
    const changedAt = new Date(Date.parse(cursor.updatedAt) + 1_000);
    await updateAccount(owner.userId, excluded, { includeInFreeToSpend: true }, changedAt);
    const incremental = await synchronize(owner.userId, { ...request, cursor }, changedAt);
    assert.deepEqual(incremental.catalog?.accounts.map((account) => [account.id, account.includeInFreeToSpend]), [[excluded, true]]);
    assert.equal(incremental.changes.length, 0, "the account setting does not create financial transactions");
  });
});
