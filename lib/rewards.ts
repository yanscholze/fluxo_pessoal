import type { FinanceCard, FinanceTransaction } from "./finance-types";

export function rewardSnapshot(amount: number, card: FinanceCard, fallbackUsdRate: number) {
  const usdRate = fallbackUsdRate || card.manualUsdRate || 0;
  const hasPoints = card.rewardMode === "points" || card.rewardMode === "both";
  const hasCashback = card.rewardMode === "cashback" || card.rewardMode === "both";
  return {
    rewardPoints: hasPoints ? (usdRate > 0 ? amount / usdRate * card.pointsPerDollar : undefined) : 0,
    rewardCashback: hasCashback ? amount * card.cashbackPercent / 100 : 0,
    rewardUsdRate: usdRate || undefined,
  };
}

export function rewardFor(transaction: FinanceTransaction, card: FinanceCard, fallbackUsdRate: number) {
  const calculated = rewardSnapshot(transaction.amount, card, transaction.rewardUsdRate ?? fallbackUsdRate);
  const hasPoints = card.rewardMode === "points" || card.rewardMode === "both";
  const hasCashback = card.rewardMode === "cashback" || card.rewardMode === "both";
  // Em compras parceladas, cada competência rende somente sobre o valor da
  // própria parcela. Isto também corrige snapshots antigos que tenham recebido
  // por engano a recompensa do total da compra na primeira parcela.
  const installmentReward = Boolean(transaction.installments);
  return {
    points: installmentReward ? calculated.rewardPoints ?? 0 : transaction.rewardPoints ?? calculated.rewardPoints ?? 0,
    cashback: installmentReward ? calculated.rewardCashback : transaction.rewardCashback ?? calculated.rewardCashback,
    usdRate: transaction.rewardUsdRate ?? calculated.rewardUsdRate ?? 0,
    estimated: installmentReward ? hasPoints && transaction.rewardUsdRate == null : (hasPoints && transaction.rewardPoints == null) || (hasCashback && transaction.rewardCashback == null),
  };
}
