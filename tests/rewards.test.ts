import assert from "node:assert/strict";
import test from "node:test";

import type { FinanceCard, FinanceTransaction } from "../lib/finance-types.ts";
import { rewardFor, rewardSnapshot } from "../lib/rewards.ts";

const ultraviolet: FinanceCard = {
  id: "uv", name: "Nubank Ultravioleta", linkedAccount: "Nubank Ultravioleta", kind: "credit",
  brand: "Mastercard", tier: "Black", last4: "0000", limit: 26350, closingDay: 1, dueDay: 8,
  dueAdjustment: "next", pointsPerDollar: 2.2, cashbackPercent: 1.25, rewardMode: "both",
  pointsGoal: 30000, manualUsdRate: 0, color: "uv",
};

test("calcula pontos por dólar e cashback por transação", () => {
  const reward = rewardSnapshot(100, ultraviolet, 5);
  assert.equal(reward.rewardPoints, 44);
  assert.equal(reward.rewardCashback, 1.25);
  assert.equal(reward.rewardUsdRate, 5);
});

test("preserva a cotação e os pontos registrados mesmo após mudança da regra", () => {
  const transaction: FinanceTransaction = {
    id: "tx", description: "Mercado", category: "Alimentação", account: "Nubank Ultravioleta",
    date: "2026-07-17", amount: 100, type: "expense", paymentMethod: "credit", cardId: "uv",
    rewardPoints: 40, rewardCashback: 1.1, rewardUsdRate: 5.5,
  };
  const reward = rewardFor(transaction, { ...ultraviolet, pointsPerDollar: 3 }, 6);
  assert.deepEqual(reward, { points: 40, cashback: 1.1, usdRate: 5.5, estimated: false });
});

test("marca lançamentos antigos sem snapshot como estimativa", () => {
  const transaction: FinanceTransaction = {
    id: "legacy", description: "Posto", category: "Transporte", account: "Nubank Ultravioleta",
    date: "2026-07-16", amount: 50, type: "expense", paymentMethod: "credit", cardId: "uv",
  };
  assert.equal(rewardFor(transaction, ultraviolet, 5).estimated, true);
});
