import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "../../kernel/money.ts";
import { localDate } from "../../time/local-date.ts";
import {
  type Account,
  type AccountKind,
  benefitAccounts,
  isSpendable,
  liquidAccounts,
  moneyAccounts,
} from "./types.ts";

const KINDS: readonly AccountKind[] = ["checking", "savings", "cash", "benefit", "investment"];

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "account", userId: "user", name: "Conta", institution: "manual",
    kind: "checking", currency: "BRL", openingBalance: cents(0),
    openedOn: localDate("2026-01-01"), goalAmount: null, monthlyYieldBasisPoints: 0,
    includeInTotals: true, isProtected: false, color: "#000000", sortOrder: 0,
    archivedAt: null, ...overrides,
  };
}

describe("participação da conta no Livre para gastar", () => {
  it("preserva o padrão histórico para dados antigos sem escolha explícita", () => {
    for (const kind of KINDS) {
      assert.equal(isSpendable(account({ kind })), ["checking", "cash", "benefit"].includes(kind), kind);
    }
  });

  it("mantém a escolha explícita ao mudar qualquer tipo de conta", () => {
    for (const kind of KINDS) {
      assert.equal(isSpendable(account({ kind, includeInFreeToSpend: true })), true, kind);
      assert.equal(isSpendable(account({ kind, includeInFreeToSpend: false })), false, kind);
    }
  });

  it("a escolha não inclui conta arquivada, em moeda estrangeira ou fora dos totais", () => {
    const included = account({ id: "included", kind: "investment", includeInFreeToSpend: true });
    const accounts = [
      included,
      account({ id: "archived", includeInFreeToSpend: true, archivedAt: "2026-11-01T12:00:00Z" }),
      account({ id: "foreign", includeInFreeToSpend: true, currency: "USD" }),
      account({ id: "annotation", includeInFreeToSpend: true, includeInTotals: false }),
      account({ id: "reserved", includeInFreeToSpend: false }),
    ];

    assert.deepEqual(liquidAccounts(accounts), [included]);
  });

  it("inclui investimento escolhido no bolso de dinheiro e mantém o benefício separado", () => {
    const invested = account({ id: "invested", kind: "investment", includeInFreeToSpend: true });
    const saved = account({ id: "saved", kind: "savings", includeInFreeToSpend: true });
    const benefit = account({ id: "benefit", kind: "benefit", includeInFreeToSpend: true });
    const hiddenBenefit = account({ id: "hidden-benefit", kind: "benefit", includeInFreeToSpend: false });
    const accounts = [invested, saved, benefit, hiddenBenefit];

    assert.deepEqual(liquidAccounts(accounts), [invested, saved, benefit]);
    assert.deepEqual(moneyAccounts(accounts), [invested, saved]);
    assert.deepEqual(benefitAccounts(accounts), [benefit]);
  });
});
