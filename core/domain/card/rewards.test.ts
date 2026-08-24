import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DomainError } from "../../kernel/errors.ts";
import { cents } from "../../kernel/money.ts";
import { competence } from "../../time/competence.ts";
import {
  type EarningRecord,
  type RewardConfig,
  assertRedeemable,
  earningFor,
  pointsOf,
  rewardBalance,
} from "./rewards.ts";

/** 1,5 ponto por dólar e 1,5% de cashback. */
function config(overrides: Partial<RewardConfig> = {}): RewardConfig {
  return {
    mode: "both",
    pointsPerDollarMilli: 1500,
    cashbackBasisPoints: 150,
    pointsGoal: 50_000,
    manualUsdRateMicros: 5_000_000,
    ...overrides,
  };
}

/** PTAX de R$ 5,43. */
const PTAX = 5_430_000;

describe("recompensas", () => {
  describe("quanto uma compra rende", () => {
    it("converte para dólar e aplica os pontos por dólar", () => {
      // R$ 100,00 ÷ 5,43 = US$ 18,4162… × 1,5 = 27,624 pontos.
      const rendeu = earningFor(cents(10000), config(), PTAX);
      assert.equal(rendeu.pointsMilli, 27624);
      assert.ok(Math.abs(pointsOf(rendeu.pointsMilli) - 27.624) < 0.001);
    });

    it("guarda a cotação usada", () => {
      // Sem o registro, reabrir a fatura do mês passado recalcularia os pontos
      // com o dólar de hoje e o extrato mudaria sozinho.
      assert.equal(earningFor(cents(10000), config(), PTAX).usdRateMicros, PTAX);
    });

    it("aplica o cashback como percentual do valor", () => {
      assert.equal(earningFor(cents(10000), config(), PTAX).cashbackCents, 150);
      assert.equal(earningFor(cents(3790), config(), PTAX).cashbackCents, 57);
    });

    it("não trunca a fração dos pontos", () => {
      // R$ 37,90 rende 10,470… pontos. Truncar a cada compra some com um
      // resgate por ano.
      const rendeu = earningFor(cents(3790), config(), PTAX);
      assert.equal(rendeu.pointsMilli, 10470);
    });

    it("cai na cotação manual quando não há PTAX", () => {
      const rendeu = earningFor(cents(10000), config(), null);
      // R$ 100 ÷ 5,00 = US$ 20 × 1,5 = 30 pontos.
      assert.equal(rendeu.pointsMilli, 30000);
      assert.equal(rendeu.usdRateMicros, 5_000_000);
    });

    it("não chuta cotação quando não há nenhuma", () => {
      const semCotacao = config({ manualUsdRateMicros: 0 });
      const rendeu = earningFor(cents(10000), semCotacao, null);
      assert.equal(rendeu.pointsMilli, 0);
      assert.equal(rendeu.usdRateMicros, 0);
      // O cashback não depende de câmbio e continua valendo.
      assert.equal(rendeu.cashbackCents, 150);
    });

    it("respeita o modo do cartão", () => {
      assert.equal(earningFor(cents(10000), config({ mode: "none" }), PTAX).pointsMilli, 0);
      assert.equal(earningFor(cents(10000), config({ mode: "none" }), PTAX).cashbackCents, 0);
      assert.equal(earningFor(cents(10000), config({ mode: "points" }), PTAX).cashbackCents, 0);
      assert.equal(earningFor(cents(10000), config({ mode: "cashback" }), PTAX).pointsMilli, 0);
      assert.ok(earningFor(cents(10000), config({ mode: "cashback" }), PTAX).cashbackCents > 0);
    });

    it("valor zero ou negativo não rende", () => {
      assert.equal(earningFor(cents(0), config(), PTAX).pointsMilli, 0);
      assert.equal(earningFor(cents(-10000), config(), PTAX).cashbackCents, 0);
    });

    it("cada parcela rende sobre o próprio valor", () => {
      // Compra de R$ 1.200 em 12x: cada parcela de R$ 100 rende separadamente,
      // e a soma bate com o total.
      const total = earningFor(cents(120000), config(), PTAX);
      const parcela = earningFor(cents(10000), config(), PTAX);
      assert.equal(parcela.cashbackCents * 12, total.cashbackCents);
    });
  });

  describe("saldo resgatável", () => {
    const ganhos: EarningRecord[] = [
      { transactionId: "t1", competence: competence("2026-06"), pointsMilli: 20000, cashbackCents: 300 },
      { transactionId: "t2", competence: competence("2026-07"), pointsMilli: 15000, cashbackCents: 200 },
      { transactionId: "t3", competence: competence("2026-08"), pointsMilli: 50000, cashbackCents: 900 },
    ];

    it("só conta o que está em fatura fechada", () => {
      // Fatura ativa é agosto: junho e julho fecharam, agosto ainda não.
      const saldo = rewardBalance(ganhos, [], competence("2026-08"), config());
      assert.equal(saldo.pointsMilli, 35000);
      assert.equal(saldo.cashbackCents, 500);
      assert.equal(saldo.pendingPointsMilli, 50000, "agosto ainda pode ser estornado");
      assert.equal(saldo.pendingCashbackCents, 900);
    });

    it("desconta os resgates já feitos", () => {
      const saldo = rewardBalance(
        ganhos,
        [
          { id: "r1", kind: "points", amount: 10000 },
          { id: "r2", kind: "cashback", amount: 200 },
        ],
        competence("2026-08"),
        config(),
      );

      assert.equal(saldo.pointsMilli, 25000);
      assert.equal(saldo.cashbackCents, 300);
      assert.equal(saldo.redeemedPointsMilli, 10000);
    });

    it("nunca devolve saldo negativo", () => {
      const saldo = rewardBalance(
        ganhos,
        [{ id: "r1", kind: "points", amount: 999999 }],
        competence("2026-08"),
        config(),
      );
      assert.equal(saldo.pointsMilli, 0);
    });

    it("calcula o progresso da meta de pontos", () => {
      // 35 pontos de uma meta de 50.000 é praticamente nada; a conta precisa
      // usar a unidade certa, não os milésimos.
      const saldo = rewardBalance(ganhos, [], competence("2026-08"), config({ pointsGoal: 35 }));
      assert.equal(saldo.goalPercent, 100);

      const distante = rewardBalance(ganhos, [], competence("2026-08"), config({ pointsGoal: 350 }));
      assert.equal(distante.goalPercent, 10);
    });

    it("sem meta definida não reporta progresso", () => {
      const saldo = rewardBalance(ganhos, [], competence("2026-08"), config({ pointsGoal: 0 }));
      assert.equal(saldo.goalPercent, 0);
    });
  });

  describe("resgate", () => {
    const saldo = rewardBalance(
      [{ transactionId: "t1", competence: competence("2026-06"), pointsMilli: 20000, cashbackCents: 500 }],
      [],
      competence("2026-08"),
      config(),
    );

    it("aceita resgate dentro do saldo", () => {
      assert.doesNotThrow(() => assertRedeemable(saldo, "points", 20000));
      assert.doesNotThrow(() => assertRedeemable(saldo, "cashback", 300));
    });

    it("recusa resgate acima do saldo", () => {
      assert.throws(() => assertRedeemable(saldo, "points", 20001), DomainError);
      assert.throws(() => assertRedeemable(saldo, "cashback", 501), DomainError);
    });

    it("recusa valor zero ou negativo", () => {
      assert.throws(() => assertRedeemable(saldo, "points", 0), DomainError);
      assert.throws(() => assertRedeemable(saldo, "cashback", -100), DomainError);
    });
  });
});
