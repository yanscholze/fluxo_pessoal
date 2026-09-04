import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "../../kernel/money.ts";
import { localDate } from "../../time/local-date.ts";
import {
  HOUR,
  amountFor,
  effectiveRate,
  fromHours,
  fromMinutes,
  milli,
  sumMilli,
  toHours,
} from "./hours.ts";
import {
  evaluateDeadline,
  evaluateProject,
  summarizeEffort,
  summarizeFinance,
  type PaymentLike,
  type TimeEntryLike,
} from "./project.ts";

const HOJE = localDate("2026-08-20");

describe("horas", () => {
  it("um quarto de hora somado quatro vezes dá exatamente uma hora", () => {
    const quarto = fromHours(0.25);
    assert.equal(quarto, 250);
    assert.equal(sumMilli([quarto, quarto, quarto, quarto]), HOUR);
  });

  it("oito sessões de 0,1h somam exatamente 0,8h", () => {
    // Em decimal isto daria 0.7999999999999999, e o valor a cobrar sairia
    // um centavo errado.
    const decimo = fromHours(0.1);
    assert.equal(sumMilli(Array.from({ length: 8 }, () => decimo)), 800);
    assert.equal(toHours(sumMilli(Array.from({ length: 8 }, () => decimo))), 0.8);
  });

  it("converte minutos", () => {
    assert.equal(fromMinutes(90), 1500);
    assert.equal(fromMinutes(20), 333, "arredonda ao milésimo mais próximo");
  });

  it("recusa duração negativa e fracionária", () => {
    assert.throws(() => milli(-1), /negativa/);
    assert.throws(() => milli(1.5), /inteiro/);
    assert.throws(() => fromHours(-2), /válida/);
  });

  it("multiplica tempo por valor/hora sem passar por decimal", () => {
    // 1,5h a R$ 120,00/h são R$ 180,00.
    assert.equal(amountFor(fromHours(1.5), cents(12_000)), 18_000);
    // 0,1h a R$ 137,00/h são R$ 13,70 — inteiro exato, sem passar por 13,7.
    assert.equal(amountFor(fromHours(0.1), cents(13_700)), 1_370);
  });

  it("valor/hora efetivo é nulo sem tempo registrado", () => {
    assert.equal(effectiveRate(cents(100_000), milli(0)), null);
    assert.equal(effectiveRate(cents(100_000), fromHours(10)), 10_000);
  });
});

describe("financeiro do projeto", () => {
  const parcelas: PaymentLike[] = [
    { amount: cents(200_000), dueOn: localDate("2026-07-10"), receivedOn: localDate("2026-07-10") },
    { amount: cents(200_000), dueOn: localDate("2026-08-10"), receivedOn: null },
    { amount: cents(200_000), dueOn: localDate("2026-09-10"), receivedOn: null },
  ];

  it("separa recebido, a vencer e vencido", () => {
    const resumo = summarizeFinance(cents(600_000), parcelas, HOJE);

    assert.equal(resumo.received, 200_000);
    assert.equal(resumo.overdue, 200_000, "a parcela de 10/08 já venceu");
    assert.equal(resumo.pending, 200_000, "a de 10/09 ainda não");
    assert.equal(resumo.nextDueOn, "2026-09-10");
  });

  it("acusa contrato sem parcela agendada", () => {
    // Contrato de 8.000 com só 6.000 em parcelas: 2.000 que ninguém vai cobrar.
    const resumo = summarizeFinance(cents(800_000), parcelas, HOJE);
    assert.equal(resumo.unscheduled, 200_000);
  });

  it("não inventa valor a agendar quando as parcelas passam do contrato", () => {
    const resumo = summarizeFinance(cents(400_000), parcelas, HOJE);
    assert.equal(resumo.unscheduled, 0);
  });

  it("percentual recebido é zero sem contrato", () => {
    const resumo = summarizeFinance(cents(0), [], HOJE);
    assert.equal(resumo.percentReceived, 0);
  });
});

describe("esforço do projeto", () => {
  const sessoes: TimeEntryLike[] = [
    { duration: fromHours(8), billable: true, rate: cents(12_000) },
    { duration: fromHours(6), billable: true, rate: cents(12_000) },
    // Retrabalho não cobrado: consome tempo e não gera receita.
    { duration: fromHours(4), billable: false, rate: cents(12_000) },
  ];

  it("separa tempo total de tempo cobrável", () => {
    const esforco = summarizeEffort(fromHours(20), sessoes, cents(12_000), cents(150_000));

    assert.equal(esforco.worked, 18_000);
    assert.equal(esforco.billableWorked, 14_000);
    assert.equal(esforco.billableAmount, 168_000, "14h a R$ 120,00");
  });

  it("acusa estouro da estimativa", () => {
    const esforco = summarizeEffort(fromHours(10), sessoes, cents(12_000), cents(150_000));

    assert.equal(esforco.overrun, true);
    assert.equal(esforco.remaining, -8_000, "8h além do estimado");
    assert.equal(Math.round(esforco.percentUsed), 180);
  });

  it("o valor/hora efetivo divide pelo tempo todo, inclusive o não cobrável", () => {
    // R$ 1.500,00 recebidos por 18h de trabalho dão R$ 83,33/h — e não os
    // R$ 107,14 que sairiam se o retrabalho fosse ignorado.
    const esforco = summarizeEffort(fromHours(20), sessoes, cents(12_000), cents(150_000));
    assert.equal(esforco.effectiveRate, 8_333);
  });

  it("sem tempo registrado não há valor/hora efetivo", () => {
    const esforco = summarizeEffort(fromHours(20), [], cents(12_000), cents(150_000));
    assert.equal(esforco.effectiveRate, null);
  });
});

describe("prazo", () => {
  it("entregue não fica atrasado", () => {
    const prazo = evaluateDeadline(localDate("2026-08-01"), localDate("2026-08-05"), HOJE);
    assert.equal(prazo.status, "entregue");
  });

  it("prazo vencido é atraso, com os dias em negativo", () => {
    const prazo = evaluateDeadline(localDate("2026-08-10"), null, HOJE);
    assert.equal(prazo.status, "atrasado");
    assert.equal(prazo.daysLeft, -10);
  });

  it("a menos de uma semana já pede atenção", () => {
    assert.equal(evaluateDeadline(localDate("2026-08-25"), null, HOJE).status, "perto");
    assert.equal(evaluateDeadline(localDate("2026-09-30"), null, HOJE).status, "no-prazo");
  });

  it("sem prazo não há julgamento", () => {
    const prazo = evaluateDeadline(null, null, HOJE);
    assert.equal(prazo.status, "sem-prazo");
    assert.equal(prazo.daysLeft, null);
  });
});

describe("avaliação completa", () => {
  it("compara o efetivo com o combinado", () => {
    const saude = evaluateProject({
      contracted: cents(600_000),
      estimated: fromHours(20),
      plannedRate: cents(12_000),
      payments: [{ amount: cents(600_000), dueOn: localDate("2026-07-10"), receivedOn: localDate("2026-07-10") }],
      entries: [{ duration: fromHours(40), billable: true, rate: cents(12_000) }],
      dueOn: localDate("2026-09-30"),
      deliveredOn: null,
      today: HOJE,
    });

    // R$ 6.000,00 por 40h dão R$ 150,00/h — acima dos R$ 120,00 combinados,
    // mesmo com o dobro do tempo estimado.
    assert.equal(saude.effort.effectiveRate, 15_000);
    assert.equal(saude.meetsRate, true);
    assert.equal(saude.effort.overrun, true);
  });

  it("sem valor/hora combinado não afirma nada sobre o retorno", () => {
    const saude = evaluateProject({
      contracted: cents(100_000),
      estimated: fromHours(10),
      plannedRate: cents(0),
      payments: [],
      entries: [{ duration: fromHours(5), billable: true, rate: cents(0) }],
      dueOn: null,
      deliveredOn: null,
      today: HOJE,
    });

    assert.equal(saude.meetsRate, null);
  });
});
