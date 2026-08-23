import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  adjustToBusinessDay,
  bankHolidays,
  businessDaysBetween,
  businessDaysInMonth,
  isBusinessDay,
  isHoliday,
  nthBusinessDayOfMonth,
} from "./brazilian-calendar.ts";
import { localDate } from "./local-date.ts";

describe("calendário brasileiro", () => {
  it("deriva os feriados móveis da Páscoa", () => {
    // Páscoa 2026: 05/04.
    const feriados = bankHolidays(2026);
    assert.ok(feriados.has("2026-02-16"), "segunda de Carnaval");
    assert.ok(feriados.has("2026-02-17"), "terça de Carnaval");
    assert.ok(feriados.has("2026-04-03"), "Sexta-feira da Paixão");
    assert.ok(feriados.has("2026-06-04"), "Corpus Christi");
  });

  it("deriva corretamente em outro ano", () => {
    // Páscoa 2025: 20/04.
    const feriados = bankHolidays(2025);
    assert.ok(feriados.has("2025-03-03"), "segunda de Carnaval");
    assert.ok(feriados.has("2025-03-04"), "terça de Carnaval");
    assert.ok(feriados.has("2025-04-18"), "Sexta-feira da Paixão");
    assert.ok(feriados.has("2025-06-19"), "Corpus Christi");
  });

  it("inclui os feriados nacionais fixos", () => {
    const feriados = bankHolidays(2026);
    for (const dia of ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]) {
      assert.ok(feriados.has(`2026-${dia}`), dia);
    }
  });

  it("reconhece dia útil, fim de semana e feriado", () => {
    assert.ok(isBusinessDay(localDate("2026-08-13"))); // quinta comum
    assert.equal(isBusinessDay(localDate("2026-08-15")), false); // sábado
    assert.equal(isBusinessDay(localDate("2026-08-16")), false); // domingo
    assert.equal(isBusinessDay(localDate("2026-09-07")), false); // Independência, segunda
    assert.ok(isHoliday(localDate("2026-12-25")));
  });

  describe("adjustToBusinessDay", () => {
    it("recua para a sexta quando cai no fim de semana", () => {
      assert.equal(adjustToBusinessDay(localDate("2026-08-15"), "previous"), "2026-08-14");
      assert.equal(adjustToBusinessDay(localDate("2026-08-16"), "previous"), "2026-08-14");
    });

    it("avança para a segunda quando cai no fim de semana", () => {
      assert.equal(adjustToBusinessDay(localDate("2026-08-15"), "next"), "2026-08-17");
      assert.equal(adjustToBusinessDay(localDate("2026-08-16"), "next"), "2026-08-17");
    });

    it("pula o feriado emendado ao fim de semana", () => {
      // 07/09/2026 é segunda-feira (Independência): o dia útil anterior é
      // sexta 04/09, e o próximo é terça 08/09.
      assert.equal(adjustToBusinessDay(localDate("2026-09-07"), "previous"), "2026-09-04");
      assert.equal(adjustToBusinessDay(localDate("2026-09-07"), "next"), "2026-09-08");
    });

    it("devolve a própria data quando já é dia útil", () => {
      assert.equal(adjustToBusinessDay(localDate("2026-08-13"), "previous"), "2026-08-13");
      assert.equal(adjustToBusinessDay(localDate("2026-08-13"), "next"), "2026-08-13");
    });
  });

  describe("dias úteis do mês", () => {
    it("conta agosto de 2026", () => {
      // Agosto/2026 tem 31 dias, 5 sábados, 5 domingos e nenhum feriado.
      assert.equal(businessDaysInMonth(2026, 8), 21);
    });

    it("desconta o feriado de setembro", () => {
      // Setembro/2026: 30 dias, 4 sábados, 4 domingos, Independência na segunda.
      assert.equal(businessDaysInMonth(2026, 9), 21);
    });

    it("lida com fevereiro bissexto e desconta o Carnaval", () => {
      // Fevereiro/2024: 29 dias, 21 de semana, menos segunda (12) e terça (13)
      // de Carnaval — Páscoa caiu em 31/03.
      assert.equal(businessDaysInMonth(2024, 2), 19);
    });
  });

  describe("nthBusinessDayOfMonth", () => {
    it("resolve o 5º dia útil, base do salário", () => {
      // Agosto/2026 começa num sábado: os dias úteis são 3,4,5,6,7...
      assert.equal(nthBusinessDayOfMonth(2026, 8, 1), "2026-08-03");
      assert.equal(nthBusinessDayOfMonth(2026, 8, 5), "2026-08-07");
    });

    it("pula o feriado ao contar", () => {
      // Setembro/2026: 1,2,3,4 úteis; 7 é feriado; o 5º útil é dia 8.
      assert.equal(nthBusinessDayOfMonth(2026, 9, 5), "2026-09-08");
    });

    it("devolve o último dia útil quando o mês não tem tantos", () => {
      assert.equal(nthBusinessDayOfMonth(2026, 8, 99), "2026-08-31");
    });
  });

  it("conta dias úteis entre datas, fim exclusivo", () => {
    assert.equal(businessDaysBetween(localDate("2026-08-13"), localDate("2026-08-18")), 3); // 13,14,17
    assert.equal(businessDaysBetween(localDate("2026-08-13"), localDate("2026-08-13")), 0);
  });
});
