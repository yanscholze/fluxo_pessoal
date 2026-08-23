import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DateError,
  addDays,
  addMonths,
  daysBetween,
  format,
  fromParts,
  isLocalDate,
  isWithin,
  lastDayOfMonth,
  localDate,
  parseLocalDate,
  todayIn,
  weekday,
} from "./local-date.ts";

describe("local-date", () => {
  it("valida datas reais e recusa inexistentes", () => {
    assert.ok(isLocalDate("2026-08-13"));
    assert.ok(isLocalDate("2024-02-29"));
    assert.equal(isLocalDate("2026-02-30"), false);
    assert.equal(isLocalDate("2025-02-29"), false);
    assert.equal(isLocalDate("2026-13-01"), false);
    assert.equal(isLocalDate("13/08/2026"), false);
    assert.throws(() => localDate("2026-02-30"), DateError);
  });

  it("aceita entrada externa com tolerância", () => {
    assert.equal(parseLocalDate("2026-08-13T10:30:00Z"), "2026-08-13");
    assert.equal(parseLocalDate("  2026-08-13  "), "2026-08-13");
    assert.equal(parseLocalDate(20260813), null);
    assert.equal(parseLocalDate(null), null);
  });

  describe("todayIn", () => {
    it("usa o fuso de Brasília, não UTC", () => {
      // 01:30 UTC de 14/08 ainda é 22:30 de 13/08 em São Paulo.
      // `toISOString().slice(0,10)` devolveria 14/08 e jogaria a compra para a
      // competência errada.
      assert.equal(todayIn(new Date("2026-08-14T01:30:00Z")), "2026-08-13");
    });

    it("vira o dia às 03:00 UTC", () => {
      assert.equal(todayIn(new Date("2026-08-14T02:59:59Z")), "2026-08-13");
      assert.equal(todayIn(new Date("2026-08-14T03:00:00Z")), "2026-08-14");
    });
  });

  describe("addMonths", () => {
    it("grampeia no último dia quando o mês seguinte é mais curto", () => {
      assert.equal(addMonths(localDate("2026-01-31"), 1), "2026-02-28");
      assert.equal(addMonths(localDate("2024-01-31"), 1), "2024-02-29");
      assert.equal(addMonths(localDate("2026-03-31"), 1), "2026-04-30");
    });

    it("preserva o dia quando ele existe no destino", () => {
      assert.equal(addMonths(localDate("2026-01-15"), 1), "2026-02-15");
      assert.equal(addMonths(localDate("2026-01-31"), 2), "2026-03-31");
    });

    it("atravessa o fim do ano nos dois sentidos", () => {
      assert.equal(addMonths(localDate("2026-12-15"), 1), "2027-01-15");
      assert.equal(addMonths(localDate("2026-01-15"), -1), "2025-12-15");
      assert.equal(addMonths(localDate("2026-08-13"), 12), "2027-08-13");
    });
  });

  it("soma dias atravessando meses e anos bissextos", () => {
    assert.equal(addDays(localDate("2026-08-31"), 1), "2026-09-01");
    assert.equal(addDays(localDate("2024-02-28"), 1), "2024-02-29");
    assert.equal(addDays(localDate("2025-02-28"), 1), "2025-03-01");
    assert.equal(addDays(localDate("2026-01-01"), -1), "2025-12-31");
  });

  it("conta dias entre datas", () => {
    assert.equal(daysBetween(localDate("2026-08-13"), localDate("2026-08-20")), 7);
    assert.equal(daysBetween(localDate("2026-08-20"), localDate("2026-08-13")), -7);
    assert.equal(daysBetween(localDate("2026-08-13"), localDate("2026-08-13")), 0);
    assert.equal(daysBetween(localDate("2026-01-01"), localDate("2027-01-01")), 365);
  });

  it("identifica o dia da semana", () => {
    assert.equal(weekday(localDate("2026-08-13")), 4); // quinta
    assert.equal(weekday(localDate("2026-08-15")), 6); // sábado
    assert.equal(weekday(localDate("2026-08-16")), 0); // domingo
  });

  it("resolve o último dia do mês", () => {
    assert.equal(lastDayOfMonth(localDate("2026-02-10")), "2026-02-28");
    assert.equal(lastDayOfMonth(localDate("2024-02-10")), "2024-02-29");
    assert.equal(lastDayOfMonth(localDate("2026-08-01")), "2026-08-31");
  });

  it("testa intervalo fechado", () => {
    const inicio = localDate("2026-08-14");
    const fim = localDate("2026-09-13");
    assert.ok(isWithin(localDate("2026-08-14"), inicio, fim));
    assert.ok(isWithin(localDate("2026-09-13"), inicio, fim));
    assert.equal(isWithin(localDate("2026-08-13"), inicio, fim), false);
    assert.equal(isWithin(localDate("2026-09-14"), inicio, fim), false);
  });

  it("formata sem deslocar o dia por fuso", () => {
    assert.equal(format(localDate("2026-01-01")), "01/01/2026");
    assert.equal(format(fromParts(2026, 8, 13)), "13/08/2026");
  });
});
