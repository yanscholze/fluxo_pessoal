import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DateError } from "./local-date.ts";
import { localDate } from "./local-date.ts";
import {
  businessDayCount,
  competence,
  competenceOf,
  containsDate,
  distance,
  firstDay,
  formatLong,
  formatShort,
  isCompetence,
  lastDay,
  next,
  parseCompetence,
  previous,
  range,
  series,
  shift,
} from "./competence.ts";

describe("competência", () => {
  it("valida o formato", () => {
    assert.ok(isCompetence("2026-08"));
    assert.ok(isCompetence("2026-12"));
    assert.equal(isCompetence("2026-13"), false);
    assert.equal(isCompetence("2026-00"), false);
    assert.equal(isCompetence("2026-8"), false);
    assert.equal(isCompetence("2026-08-13"), false);
    assert.throws(() => competence("2026-13"), DateError);
  });

  it("aceita entrada externa com tolerância", () => {
    assert.equal(parseCompetence("2026-08-13"), "2026-08");
    assert.equal(parseCompetence(" 2026-08 "), "2026-08");
    assert.equal(parseCompetence("agosto"), null);
    assert.equal(parseCompetence(undefined), null);
  });

  it("extrai a competência de uma data", () => {
    assert.equal(competenceOf(localDate("2026-08-13")), "2026-08");
    assert.equal(competenceOf(localDate("2026-01-01")), "2026-01");
  });

  describe("aritmética", () => {
    it("desloca meses atravessando o ano", () => {
      assert.equal(next(competence("2026-12")), "2027-01");
      assert.equal(previous(competence("2026-01")), "2025-12");
      assert.equal(shift(competence("2026-08"), 6), "2027-02");
      assert.equal(shift(competence("2026-08"), -20), "2024-12");
    });

    it("mede distância em meses", () => {
      assert.equal(distance(competence("2026-08"), competence("2026-11")), 3);
      assert.equal(distance(competence("2026-11"), competence("2026-08")), -3);
      assert.equal(distance(competence("2026-08"), competence("2027-08")), 12);
      assert.equal(distance(competence("2026-08"), competence("2026-08")), 0);
    });

    it("gera intervalos inclusivos", () => {
      assert.deepEqual(range(competence("2026-11"), competence("2027-01")), ["2026-11", "2026-12", "2027-01"]);
      assert.deepEqual(range(competence("2026-08"), competence("2026-08")), ["2026-08"]);
      assert.deepEqual(range(competence("2026-11"), competence("2026-08")), []);
    });

    it("gera séries de N competências para parcelamento", () => {
      assert.deepEqual(series(competence("2026-11"), 3), ["2026-11", "2026-12", "2027-01"]);
      assert.equal(series(competence("2026-08"), 48).length, 48);
      assert.equal(series(competence("2026-08"), 48).at(-1), "2030-07");
      assert.throws(() => series(competence("2026-08"), 0), DateError);
    });
  });

  it("delimita o mês civil da competência", () => {
    assert.equal(firstDay(competence("2026-02")), "2026-02-01");
    assert.equal(lastDay(competence("2026-02")), "2026-02-28");
    assert.equal(lastDay(competence("2024-02")), "2024-02-29");
    assert.ok(containsDate(competence("2026-08"), localDate("2026-08-31")));
    assert.equal(containsDate(competence("2026-08"), localDate("2026-09-01")), false);
  });

  it("conta os dias úteis do mês, base do vale-alimentação", () => {
    assert.equal(businessDayCount(competence("2026-08")), 21);
    assert.equal(businessDayCount(competence("2026-09")), 21);
  });

  it("formata para exibição", () => {
    assert.equal(formatShort(competence("2026-08")), "ago de 2026");
    assert.equal(formatLong(competence("2026-08")), "agosto de 2026");
  });
});
