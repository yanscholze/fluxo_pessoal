import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DomainError } from "../../kernel/errors.ts";
import { cents, sum } from "../../kernel/money.ts";
import { competence } from "../../time/competence.ts";
import { localDate } from "../../time/local-date.ts";
import type { CycleConfig } from "../card/invoice-cycle.ts";
import { anticipationLadder, simulateAnticipation } from "./anticipation.ts";
import {
  type InstallmentPlan,
  futureCommitmentByCompetence,
  installmentStatus,
  scheduleInstallments,
  scheduleTotal,
  summarizeProgress,
} from "./plan.ts";

const fecha13: CycleConfig = { closingDay: 13, dueDay: 20, dueAdjustment: "next" };

describe("cronograma de parcelas", () => {
  it("divide sem perder centavos", () => {
    const schedule = scheduleInstallments({
      totalAmount: cents(100000),
      installmentCount: 3,
      purchaseDate: localDate("2026-08-10"),
      cycle: fecha13,
    });

    assert.deepEqual(
      schedule.map((item) => item.amount),
      [33334, 33333, 33333],
    );
    assert.equal(scheduleTotal(schedule), 100000, "a soma bate com a compra");
  });

  it("mantém a soma exata em qualquer combinação", () => {
    for (const total of [1, 7, 99, 12345, 999999]) {
      for (const count of [2, 3, 7, 12, 48]) {
        const schedule = scheduleInstallments({
          totalAmount: cents(total),
          installmentCount: count,
          purchaseDate: localDate("2026-08-10"),
          cycle: fecha13,
        });
        assert.equal(scheduleTotal(schedule), total, `${total} em ${count}x`);
      }
    }
  });

  it("numera as parcelas com inteiros, não com texto", () => {
    const schedule = scheduleInstallments({
      totalAmount: cents(120000),
      installmentCount: 12,
      purchaseDate: localDate("2026-08-10"),
      cycle: fecha13,
    });

    assert.deepEqual(
      schedule.map((item) => item.number),
      Array.from({ length: 12 }, (_unused, index) => index + 1),
    );
  });

  it("distribui as parcelas em competências consecutivas", () => {
    const schedule = scheduleInstallments({
      totalAmount: cents(60000),
      installmentCount: 4,
      purchaseDate: localDate("2026-08-10"),
      cycle: fecha13,
    });

    assert.deepEqual(
      schedule.map((item) => item.competence),
      ["2026-08", "2026-09", "2026-10", "2026-11"],
    );
  });

  it("começa na competência seguinte quando a compra é pós-fechamento", () => {
    const schedule = scheduleInstallments({
      totalAmount: cents(60000),
      installmentCount: 3,
      purchaseDate: localDate("2026-08-14"),
      cycle: fecha13,
    });

    assert.deepEqual(
      schedule.map((item) => item.competence),
      ["2026-09", "2026-10", "2026-11"],
    );
  });

  it("acompanha o vencimento de cada fatura", () => {
    const schedule = scheduleInstallments({
      totalAmount: cents(30000),
      installmentCount: 2,
      purchaseDate: localDate("2026-08-10"),
      cycle: fecha13,
    });

    assert.equal(schedule[0].dueDate, "2026-08-20");
    assert.equal(schedule[1].dueDate, "2026-09-21"); // 20/09 é domingo
  });

  it("recusa quantidade fora da faixa aceita", () => {
    const base = { totalAmount: cents(1000), purchaseDate: localDate("2026-08-10"), cycle: fecha13 };
    assert.throws(() => scheduleInstallments({ ...base, installmentCount: 0 }), DomainError);
    assert.throws(() => scheduleInstallments({ ...base, installmentCount: 49 }), DomainError);
    assert.doesNotThrow(() => scheduleInstallments({ ...base, installmentCount: 48 }));
  });
});

describe("situação da parcela", () => {
  const emAtraso = new Set([competence("2026-07")]);

  it("está em aberto da fatura ativa em diante", () => {
    assert.equal(installmentStatus(competence("2026-09"), competence("2026-09"), emAtraso), "open");
    assert.equal(installmentStatus(competence("2026-12"), competence("2026-09"), emAtraso), "open");
  });

  it("está paga quando a fatura anterior foi quitada", () => {
    assert.equal(installmentStatus(competence("2026-08"), competence("2026-09"), emAtraso), "paid");
  });

  it("está atrasada quando a fatura anterior segue devendo", () => {
    assert.equal(installmentStatus(competence("2026-07"), competence("2026-09"), emAtraso), "overdue");
  });
});

describe("progresso do parcelamento", () => {
  const plano: InstallmentPlan = {
    id: "plan-1",
    userId: "user-1",
    cardId: "card-1",
    description: "Notebook",
    categoryId: "cat-1",
    totalAmount: cents(600000),
    installmentCount: 6,
    purchaseDate: localDate("2026-06-10"),
    firstCompetence: competence("2026-06"),
    monthlyInterestBasisPoints: 0,
    label: null,
    status: "active",
  };

  const schedule = scheduleInstallments({
    totalAmount: plano.totalAmount,
    installmentCount: plano.installmentCount,
    purchaseDate: plano.purchaseDate,
    cycle: fecha13,
  });

  it("conta parcelas pagas e em aberto", () => {
    const progresso = summarizeProgress(plano, schedule, competence("2026-09"), new Set());

    assert.equal(progresso.paidCount, 3, "junho, julho e agosto");
    assert.equal(progresso.openCount, 3);
    assert.equal(progresso.paidAmount, 300000);
    assert.equal(progresso.openAmount, 300000);
    assert.equal(progresso.percentPaid, 50);
    assert.equal(progresso.isSettled, false);
  });

  it("marca atraso sem contar como pago", () => {
    const progresso = summarizeProgress(plano, schedule, competence("2026-09"), new Set([competence("2026-08")]));

    assert.equal(progresso.overdueCount, 1);
    assert.equal(progresso.paidCount, 2);
    assert.equal(progresso.openCount, 4, "a atrasada continua sendo dívida");
  });

  it("reconhece o parcelamento quitado", () => {
    const progresso = summarizeProgress(plano, schedule, competence("2027-01"), new Set());
    assert.ok(progresso.isSettled);
    assert.equal(progresso.percentPaid, 100);
    assert.equal(progresso.nextDueDate, null);
  });

  it("usa o apelido quando o usuário define um", () => {
    const comApelido = { ...plano, label: "Notebook do trabalho" };
    assert.equal(summarizeProgress(comApelido, schedule, competence("2026-09"), new Set()).label, "Notebook do trabalho");
  });
});

describe("comprometimento futuro", () => {
  it("soma parcelas de vários planos por mês", () => {
    const notebook = scheduleInstallments({
      totalAmount: cents(600000),
      installmentCount: 6,
      purchaseDate: localDate("2026-08-10"),
      cycle: fecha13,
    });
    const celular = scheduleInstallments({
      totalAmount: cents(240000),
      installmentCount: 3,
      purchaseDate: localDate("2026-08-10"),
      cycle: fecha13,
    });

    const comprometido = futureCommitmentByCompetence([notebook, celular], competence("2026-08"), 5);

    assert.deepEqual(comprometido, [
      { competence: "2026-08", amount: 180000 },
      { competence: "2026-09", amount: 180000 },
      { competence: "2026-10", amount: 180000 },
      { competence: "2026-11", amount: 100000 },
      { competence: "2026-12", amount: 100000 },
    ]);
  });

  it("ignora competências fora da janela pedida", () => {
    const schedule = scheduleInstallments({
      totalAmount: cents(120000),
      installmentCount: 12,
      purchaseDate: localDate("2026-08-10"),
      cycle: fecha13,
    });

    const comprometido = futureCommitmentByCompetence([schedule], competence("2026-10"), 3);
    assert.deepEqual(
      comprometido.map((item) => item.competence),
      ["2026-10", "2026-11", "2026-12"],
    );
  });
});

describe("antecipação", () => {
  const semJuros = scheduleInstallments({
    totalAmount: cents(120000),
    installmentCount: 12,
    purchaseDate: localDate("2026-08-10"),
    cycle: fecha13,
  });

  it("não inventa economia em compra sem juros", () => {
    const resultado = simulateAnticipation({
      openInstallments: semJuros,
      count: 3,
      anticipationCompetence: competence("2026-08"),
      monthlyInterestBasisPoints: 0,
    });

    assert.equal(resultado.savings, 0, "sem juros embutidos não há o que economizar");
    assert.equal(resultado.nominalAmount, resultado.amountDueToday);
    assert.equal(resultado.anticipated.length, 3);
  });

  it("antecipa as últimas parcelas por padrão", () => {
    const resultado = simulateAnticipation({
      openInstallments: semJuros,
      count: 3,
      anticipationCompetence: competence("2026-08"),
      monthlyInterestBasisPoints: 0,
    });

    assert.deepEqual(
      resultado.anticipated.map((item) => item.number),
      [10, 11, 12],
    );
    assert.equal(resultado.newEndCompetence, "2027-04", "o parcelamento passa a terminar 3 meses antes");
    assert.equal(resultado.monthsShortened, 3);
  });

  it("pode antecipar as próximas em vez das últimas", () => {
    const resultado = simulateAnticipation({
      openInstallments: semJuros,
      count: 2,
      anticipationCompetence: competence("2026-08"),
      monthlyInterestBasisPoints: 0,
      target: "next",
    });

    assert.deepEqual(
      resultado.anticipated.map((item) => item.number),
      [1, 2],
    );
    assert.equal(resultado.newEndCompetence, "2027-07", "o fim não muda ao antecipar as primeiras");
  });

  it("calcula a economia real quando há juros embutidos", () => {
    // 2% ao mês: a parcela que vence daqui a 11 meses vale hoje
    // 10.000 / 1,02^11 ≈ 8.043.
    const resultado = simulateAnticipation({
      openInstallments: semJuros,
      count: 1,
      anticipationCompetence: competence("2026-08"),
      monthlyInterestBasisPoints: 200,
    });

    assert.equal(resultado.nominalAmount, 10000);
    assert.equal(resultado.amountDueToday, 8043);
    assert.equal(resultado.savings, 1957);
    assert.ok(resultado.savings > 0);
  });

  it("economiza mais quanto mais longe está a parcela", () => {
    const umaParcela = simulateAnticipation({
      openInstallments: semJuros,
      count: 1,
      anticipationCompetence: competence("2026-08"),
      monthlyInterestBasisPoints: 200,
    });
    const seisParcelas = simulateAnticipation({
      openInstallments: semJuros,
      count: 6,
      anticipationCompetence: competence("2026-08"),
      monthlyInterestBasisPoints: 200,
    });

    assert.ok(seisParcelas.savings > umaParcela.savings);
  });

  it("informa o alívio mensal e o novo término", () => {
    const resultado = simulateAnticipation({
      openInstallments: semJuros,
      count: 4,
      anticipationCompetence: competence("2026-08"),
      monthlyInterestBasisPoints: 0,
    });

    assert.equal(resultado.monthlyRelief.length, 4);
    assert.equal(sum(resultado.monthlyRelief.map((item) => item.amount)), 40000);
    assert.equal(resultado.averageMonthlyRelief, 10000);
    assert.equal(resultado.remaining.length, 8);
  });

  it("recusa antecipar mais parcelas do que existem em aberto", () => {
    assert.throws(
      () =>
        simulateAnticipation({
          openInstallments: semJuros,
          count: 13,
          anticipationCompetence: competence("2026-08"),
          monthlyInterestBasisPoints: 0,
        }),
      DomainError,
    );
    assert.throws(
      () =>
        simulateAnticipation({
          openInstallments: semJuros,
          count: 0,
          anticipationCompetence: competence("2026-08"),
          monthlyInterestBasisPoints: 0,
        }),
      DomainError,
    );
  });

  it("monta os cenários para o usuário comparar", () => {
    const cenarios = anticipationLadder(
      {
        openInstallments: semJuros,
        anticipationCompetence: competence("2026-08"),
        monthlyInterestBasisPoints: 200,
      },
      5,
    );

    assert.equal(cenarios.length, 5);
    assert.deepEqual(
      cenarios.map((item) => item.anticipated.length),
      [1, 2, 3, 4, 5],
    );
    // Cada cenário adicional economiza mais que o anterior.
    for (let index = 1; index < cenarios.length; index += 1) {
      assert.ok(cenarios[index].savings > cenarios[index - 1].savings);
    }
  });
});
