/**
 * Recompensas de cartão: pontos e cashback.
 *
 * Pontos se acumulam em **milésimos** e cashback em centavos. A precisão
 * importa: 1,5 ponto por dólar sobre uma compra de R$ 37,90 rende 10,47
 * pontos, e truncar para 10 a cada compra some com um resgate por ano.
 *
 * A cotação usada fica gravada no lançamento. Sem isso, reabrir a fatura do
 * mês passado recalcularia os pontos com o dólar de hoje — e o extrato mudaria
 * sozinho.
 */

import { validationError } from "../../kernel/errors.ts";
import { type Cents, cents } from "../../kernel/money.ts";
import { type Competence, compareCompetence } from "../../time/competence.ts";

export type RewardMode = "none" | "points" | "cashback" | "both";

export type RewardConfig = {
  readonly mode: RewardMode;
  /** Pontos por dólar em milésimos: 1500 = 1,5 ponto. */
  readonly pointsPerDollarMilli: number;
  /** Cashback em pontos-base: 150 = 1,5%. */
  readonly cashbackBasisPoints: number;
  readonly pointsGoal: number;
  /** Cotação de contingência do cartão, em micros: 5_430_000 = R$ 5,43. */
  readonly manualUsdRateMicros: number;
};

/** O que uma compra rendeu. Zero quando o cartão não dá aquela recompensa. */
export type RewardEarning = {
  /** Pontos em milésimos. */
  readonly pointsMilli: number;
  readonly cashbackCents: Cents;
  /** Cotação efetivamente usada, em micros. Zero quando não se aplica. */
  readonly usdRateMicros: number;
};

export const NO_EARNING: RewardEarning = { pointsMilli: 0, cashbackCents: cents(0), usdRateMicros: 0 };

export function earnsPoints(config: RewardConfig): boolean {
  return config.mode === "points" || config.mode === "both";
}

export function earnsCashback(config: RewardConfig): boolean {
  return config.mode === "cashback" || config.mode === "both";
}

/**
 * Quanto uma compra rende.
 *
 * `marketRateMicros` é a PTAX do dia; quando indisponível, entra a cotação
 * manual do cartão. Sem nenhuma das duas não há como converter para dólar, e a
 * função devolve zero pontos em vez de chutar uma cotação.
 */
export function earningFor(
  amount: Cents,
  config: RewardConfig,
  marketRateMicros: number | null,
): RewardEarning {
  if (config.mode === "none" || amount <= 0) return NO_EARNING;

  const rateMicros = marketRateMicros && marketRateMicros > 0 ? marketRateMicros : config.manualUsdRateMicros;

  const pointsMilli =
    earnsPoints(config) && rateMicros > 0 && config.pointsPerDollarMilli > 0
      ? Math.round((amount / rateMicros) * 10_000 * config.pointsPerDollarMilli)
      : 0;

  const cashbackCents = earnsCashback(config)
    ? cents(Math.round((amount * config.cashbackBasisPoints) / 10_000))
    : cents(0);

  return { pointsMilli, cashbackCents, usdRateMicros: pointsMilli > 0 ? rateMicros : 0 };
}

/** Uma compra que rendeu, para o cálculo do saldo resgatável. */
export type EarningRecord = {
  readonly transactionId: string;
  readonly competence: Competence;
  readonly pointsMilli: number;
  readonly cashbackCents: number;
};

export type Redemption = {
  readonly id: string;
  readonly kind: "points" | "cashback";
  /** Pontos em milésimos, ou centavos, conforme `kind`. */
  readonly amount: number;
};

export type RewardBalance = {
  /** Pontos acumulados em faturas já fechadas, menos resgates. */
  readonly pointsMilli: number;
  readonly cashbackCents: Cents;
  /** O que ainda está numa fatura aberta e por isso não pode ser resgatado. */
  readonly pendingPointsMilli: number;
  readonly pendingCashbackCents: Cents;
  readonly redeemedPointsMilli: number;
  readonly redeemedCashbackCents: Cents;
  /** Progresso rumo à meta de pontos, em percentual. */
  readonly goalPercent: number;
};

/**
 * Saldo resgatável.
 *
 * Só rende o que está em fatura **fechada**: enquanto a fatura está aberta a
 * compra ainda pode ser estornada, e o emissor só credita os pontos no
 * fechamento. Mostrar antes daria um saldo que some.
 */
export function rewardBalance(
  earnings: readonly EarningRecord[],
  redemptions: readonly Redemption[],
  activeCompetence: Competence,
  config: RewardConfig,
): RewardBalance {
  let pontosFechados = 0;
  let cashbackFechado = 0;
  let pontosPendentes = 0;
  let cashbackPendente = 0;

  for (const earning of earnings) {
    const fechada = compareCompetence(earning.competence, activeCompetence) < 0;
    if (fechada) {
      pontosFechados += earning.pointsMilli;
      cashbackFechado += earning.cashbackCents;
    } else {
      pontosPendentes += earning.pointsMilli;
      cashbackPendente += earning.cashbackCents;
    }
  }

  const pontosResgatados = redemptions
    .filter((item) => item.kind === "points")
    .reduce((soma, item) => soma + item.amount, 0);
  const cashbackResgatado = redemptions
    .filter((item) => item.kind === "cashback")
    .reduce((soma, item) => soma + item.amount, 0);

  const pontos = Math.max(0, pontosFechados - pontosResgatados);

  return {
    pointsMilli: pontos,
    cashbackCents: cents(Math.max(0, cashbackFechado - cashbackResgatado)),
    pendingPointsMilli: pontosPendentes,
    pendingCashbackCents: cents(cashbackPendente),
    redeemedPointsMilli: pontosResgatados,
    redeemedCashbackCents: cents(cashbackResgatado),
    goalPercent:
      config.pointsGoal > 0 ? Math.min(100, (pontos / 1000 / config.pointsGoal) * 100) : 0,
  };
}

/** Recusa um resgate maior que o saldo disponível. */
export function assertRedeemable(balance: RewardBalance, kind: Redemption["kind"], amount: number): void {
  if (amount <= 0) {
    throw validationError("Informe um valor maior que zero", [
      { path: "amount", message: "Informe um valor maior que zero" },
    ]);
  }

  const disponivel = kind === "points" ? balance.pointsMilli : balance.cashbackCents;
  if (amount > disponivel) {
    throw validationError(
      kind === "points"
        ? "Você não tem pontos suficientes para este resgate"
        : "Você não tem cashback suficiente para este resgate",
      [{ path: "amount", message: `Disponível: ${kind === "points" ? disponivel / 1000 : disponivel / 100}` }],
    );
  }
}

/** Pontos em unidade inteira, para exibição. */
export function pointsOf(milli: number): number {
  return milli / 1000;
}
