import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DomainError } from "../../kernel/errors.ts";
import { competence } from "../../time/competence.ts";
import { localDate } from "../../time/local-date.ts";
import {
  type CycleConfig,
  activeCompetence,
  assertValidCycle,
  closingDateFor,
  competenceForPurchase,
  cycleWindowFor,
  daysUntilClosing,
  dueDateFor,
  installmentCompetences,
  isWithinCycle,
  upcomingSchedules,
} from "./invoice-cycle.ts";

/** Cartão que fecha dia 13 e vence dia 20 — o exemplo canônico do produto. */
const fecha13: CycleConfig = { closingDay: 13, dueDay: 20, dueAdjustment: "next" };

/** Fecha dia 13 e vence dia 5 do mês seguinte. */
const venceNoMesSeguinte: CycleConfig = { closingDay: 13, dueDay: 5, dueAdjustment: "next" };

describe("ciclo de fatura", () => {
  describe("atribuição de competência", () => {
    it("respeita a regra do fechamento", () => {
      // A regra que o produto define: fecha dia 13, então 13/08 é competência
      // de agosto e 14/08 já é de setembro.
      assert.equal(competenceForPurchase(fecha13, localDate("2026-08-13")), "2026-08");
      assert.equal(competenceForPurchase(fecha13, localDate("2026-08-14")), "2026-09");
    });

    it("mantém a compra do início do mês na competência do próprio mês", () => {
      assert.equal(competenceForPurchase(fecha13, localDate("2026-08-01")), "2026-08");
    });

    it("joga a compra do fim do mês para a competência seguinte", () => {
      assert.equal(competenceForPurchase(fecha13, localDate("2026-08-31")), "2026-09");
    });

    it("recua o fechamento que cai no fim de semana", () => {
      // 13/09/2026 é domingo: o fechamento efetivo é sexta 11/09. Logo uma
      // compra no sábado 12/09 já pertence a outubro.
      assert.equal(closingDateFor(fecha13, competence("2026-09")), "2026-09-11");
      assert.equal(competenceForPurchase(fecha13, localDate("2026-09-11")), "2026-09");
      assert.equal(competenceForPurchase(fecha13, localDate("2026-09-12")), "2026-10");
    });

    it("grampeia o dia 31 em meses curtos", () => {
      const fecha31: CycleConfig = { closingDay: 31, dueDay: 10, dueAdjustment: "next" };
      // Fevereiro/2026 termina no dia 28, um sábado: fechamento efetivo 27/02.
      assert.equal(closingDateFor(fecha31, competence("2026-02")), "2026-02-27");
    });
  });

  describe("fatura ativa", () => {
    it("é a competência corrente antes do fechamento", () => {
      assert.equal(activeCompetence(fecha13, localDate("2026-08-13")), "2026-08");
    });

    it("vira para a seguinte depois do fechamento", () => {
      assert.equal(activeCompetence(fecha13, localDate("2026-08-14")), "2026-09");
    });
  });

  describe("vencimento", () => {
    it("vence no próprio mês quando o dia é posterior ao fechamento", () => {
      // Fecha 13/08, vence 20/08 — uma quinta-feira.
      assert.equal(dueDateFor(fecha13, competence("2026-08")), "2026-08-20");
    });

    it("vence no mês seguinte quando o dia é anterior ao fechamento", () => {
      // Fecha 13/08 e vence dia 5 de setembro. Mas 05/09/2026 é sábado e a
      // segunda seguinte é o feriado da Independência: o vencimento efetivo
      // encadeia os dois ajustes e cai na terça, 08/09.
      assert.equal(dueDateFor(venceNoMesSeguinte, competence("2026-08")), "2026-09-08");
    });

    it("vence no mês seguinte sem ajuste quando o dia já é útil", () => {
      // Competência de setembro: vence 05/10/2026, uma segunda-feira comum.
      assert.equal(dueDateFor(venceNoMesSeguinte, competence("2026-09")), "2026-10-05");
    });

    it("avança para o próximo dia útil por padrão", () => {
      // 20/09/2026 é domingo: vence na segunda 21/09.
      assert.equal(dueDateFor(fecha13, competence("2026-09")), "2026-09-21");
    });

    it("recua quando o cartão pede o dia útil anterior", () => {
      const recua: CycleConfig = { closingDay: 13, dueDay: 20, dueAdjustment: "previous" };
      assert.equal(dueDateFor(recua, competence("2026-09")), "2026-09-18");
    });

    it("pula o feriado emendado", () => {
      // Vence dia 7, e 07/09/2026 é Independência numa segunda-feira.
      const venceNoFeriado: CycleConfig = { closingDay: 25, dueDay: 7, dueAdjustment: "next" };
      assert.equal(dueDateFor(venceNoFeriado, competence("2026-08")), "2026-09-08");
    });
  });

  describe("janela do ciclo", () => {
    it("vai do dia seguinte ao fechamento anterior até o fechamento", () => {
      const janela = cycleWindowFor(fecha13, competence("2026-08"));
      assert.equal(janela.start, "2026-07-14");
      assert.equal(janela.end, "2026-08-13");
    });

    it("não é o mês civil", () => {
      const janela = cycleWindowFor(fecha13, competence("2026-08"));
      assert.ok(isWithinCycle(janela, localDate("2026-07-20")), "julho depois do fechamento entra");
      assert.equal(isWithinCycle(janela, localDate("2026-08-20")), false, "agosto depois do fechamento sai");
    });

    it("encadeia sem buraco nem sobreposição entre competências", () => {
      const agosto = cycleWindowFor(fecha13, competence("2026-08"));
      const setembro = cycleWindowFor(fecha13, competence("2026-09"));
      // O início de setembro é exatamente o dia seguinte ao fim de agosto.
      assert.equal(setembro.start, "2026-08-14");
      assert.equal(agosto.end, "2026-08-13");
    });
  });

  describe("parcelamento", () => {
    it("distribui as parcelas em competências consecutivas", () => {
      const competencias = installmentCompetences(fecha13, localDate("2026-08-10"), 5);
      assert.deepEqual(competencias, ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
    });

    it("começa na competência seguinte quando a compra é pós-fechamento", () => {
      const competencias = installmentCompetences(fecha13, localDate("2026-08-14"), 3);
      assert.deepEqual(competencias, ["2026-09", "2026-10", "2026-11"]);
    });

    it("atravessa a virada do ano", () => {
      const competencias = installmentCompetences(fecha13, localDate("2026-11-10"), 4);
      assert.deepEqual(competencias, ["2026-11", "2026-12", "2027-01", "2027-02"]);
    });
  });

  it("conta os dias até o fechamento da fatura aberta", () => {
    assert.equal(daysUntilClosing(fecha13, localDate("2026-08-11")), 2);
    assert.equal(daysUntilClosing(fecha13, localDate("2026-08-13")), 0);
    // Passado o fechamento, a fatura aberta é a de setembro, que fecha em
    // 11/09 (13/09 é domingo) — não faz sentido contar dias negativos para
    // uma fatura que a tela nem está mostrando.
    assert.equal(daysUntilClosing(fecha13, localDate("2026-08-14")), 28);
    assert.equal(daysUntilClosing(fecha13, localDate("2026-08-20")), 22);
  });

  describe("fechamento que recua para o mês anterior", () => {
    // Fechamento no dia 1: sempre que 1º cai em fim de semana ou feriado, o
    // fechamento efetivo cai no mês anterior.
    const fecha1: CycleConfig = { closingDay: 1, dueDay: 10, dueAdjustment: "next" };

    it("não joga a compra numa fatura já fechada", () => {
      // closingDateFor(2026-01) = 31/12/2025 (1º de janeiro é feriado).
      // closingDateFor(2026-02) = 30/01/2026 (1º de fevereiro é domingo).
      // Uma compra em 31/01 está depois dos dois: só cabe em março.
      assert.equal(closingDateFor(fecha1, competence("2026-01")), "2025-12-31");
      assert.equal(closingDateFor(fecha1, competence("2026-02")), "2026-01-30");
      assert.equal(competenceForPurchase(fecha1, localDate("2026-01-31")), "2026-03");
    });

    it("a competência escolhida sempre tem fechamento no futuro da compra", () => {
      for (const dia of ["2026-01-29", "2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]) {
        const compra = localDate(dia);
        const escolhida = competenceForPurchase(fecha1, compra);
        assert.ok(
          compra <= closingDateFor(fecha1, escolhida),
          `${dia} caiu em ${escolhida}, que fecha em ${closingDateFor(fecha1, escolhida)}`,
        );
      }
    });

    it("a janela do ciclo ativo contém a data de hoje", () => {
      const fecha2: CycleConfig = { closingDay: 2, dueDay: 10, dueAdjustment: "next" };
      for (const dia of ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]) {
        const hoje = localDate(dia);
        const janela = cycleWindowFor(fecha2, activeCompetence(fecha2, hoje));
        assert.ok(
          isWithinCycle(janela, hoje),
          `${dia} ficou fora da janela ${janela.start}..${janela.end}`,
        );
      }
    });
  });

  it("monta a agenda das próximas faturas", () => {
    const agenda = upcomingSchedules(fecha13, localDate("2026-08-14"), 3);
    assert.deepEqual(
      agenda.map((item) => item.competence),
      ["2026-09", "2026-10", "2026-11"],
    );
    assert.equal(agenda[0].closingDate, "2026-09-11"); // 13/09 é domingo
    assert.equal(agenda[0].dueDate, "2026-09-21"); // 20/09 é domingo
  });

  it("recusa configuração fora das faixas", () => {
    assert.throws(() => assertValidCycle({ closingDay: 0, dueDay: 10, dueAdjustment: "next" }), DomainError);
    assert.throws(() => assertValidCycle({ closingDay: 13, dueDay: 32, dueAdjustment: "next" }), DomainError);
    assert.doesNotThrow(() => assertValidCycle(fecha13));
  });
});
