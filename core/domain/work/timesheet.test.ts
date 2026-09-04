/**
 * O relatório de horas.
 *
 * O que precisa ficar preso aqui é a conta que decide se valeu a pena: o
 * valor/hora efetivo sai da receita dividida pelo tempo **todo**, e o
 * percentual por categoria fecha em cem. Se qualquer um dos dois estiver
 * errado, o relatório diz que o projeto rendeu quando ele não rendeu.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "../../kernel/money.ts";
import { localDate } from "../../time/local-date.ts";
import { averageHoursPerProject, buildTimesheet, type SessionLike } from "./timesheet.ts";
import { fromHours, fromMinutes, ZERO_MILLI } from "./hours.ts";

function sessao(parcial: Partial<SessionLike> & { duration: SessionLike["duration"] }): SessionLike {
  return {
    id: "s",
    workedOn: localDate("2026-08-10"),
    activity: "development",
    billable: true,
    description: "",
    ...parcial,
  };
}

describe("relatório de horas", () => {
  const sessoes: SessionLike[] = [
    sessao({ id: "1", duration: fromHours(10), activity: "development", workedOn: localDate("2026-08-03") }),
    sessao({ id: "2", duration: fromHours(5), activity: "bugs", workedOn: localDate("2026-08-05") }),
    sessao({ id: "3", duration: fromHours(3), activity: "meeting", billable: false, workedOn: localDate("2026-08-05") }),
    sessao({ id: "4", duration: fromHours(2), activity: "deploy", workedOn: localDate("2026-08-20") }),
  ];

  it("o valor/hora efetivo é a receita dividida pelo tempo todo", () => {
    // R$ 4.000,00 por 20h dão R$ 200,00/h. Não os R$ 235,29 que sairiam se as
    // 3h de reunião não cobradas fossem tiradas do divisor.
    const relatorio = buildTimesheet(sessoes, cents(400_000));

    assert.equal(relatorio.worked, 20_000);
    assert.equal(relatorio.billableWorked, 17_000);
    assert.equal(relatorio.effectiveRate, 20_000);
  });

  it("o percentual por categoria fecha em cem", () => {
    const relatorio = buildTimesheet(sessoes, cents(400_000));
    const soma = relatorio.byActivity.reduce((total, linha) => total + linha.percent, 0);

    assert.ok(Math.abs(soma - 100) < 0.0001, `somou ${soma}`);
    assert.equal(relatorio.byActivity.length, 4);
  });

  it("as categorias vêm da maior para a menor, com a contagem de sessões", () => {
    const relatorio = buildTimesheet(
      [...sessoes, sessao({ id: "5", duration: fromHours(1), activity: "bugs" })],
      cents(400_000),
    );

    assert.deepEqual(
      relatorio.byActivity.map((linha) => linha.activity),
      ["development", "bugs", "meeting", "deploy"],
    );
    assert.equal(relatorio.byActivity[1].worked, 6_000, "duas sessões de bug somam 6h");
    assert.equal(relatorio.byActivity[1].sessions, 2);
  });

  it("separa retrabalho do que produz entrega", () => {
    const relatorio = buildTimesheet(sessoes, cents(400_000));

    assert.equal(relatorio.reworkWorked, 5_000, "as 5h de bug");
    assert.equal(relatorio.reworkPercent, 25);
    assert.equal(relatorio.deliveryWorked, 17_000, "desenvolvimento, bugs e deploy");
  });

  it("sem horas lançadas não há valor/hora, mesmo com receita", () => {
    const relatorio = buildTimesheet([], cents(400_000));

    assert.equal(relatorio.effectiveRate, null, "infinito por hora não é informação");
    assert.equal(relatorio.worked, ZERO_MILLI);
    assert.equal(relatorio.revenue, 400_000, "a receita continua sendo dita");
    assert.equal(relatorio.byActivity.length, 0);
  });

  it("sem receita o valor/hora é zero, e isso é uma informação", () => {
    // Diferente de `null`: aqui houve trabalho e não entrou dinheiro. É o
    // projeto que precisa aparecer no relatório, não sumir dele.
    const relatorio = buildTimesheet(sessoes, cents(0));
    assert.equal(relatorio.effectiveRate, 0);
  });

  it("diz em quanto tempo o esforço se espalhou", () => {
    const relatorio = buildTimesheet(sessoes, cents(400_000));

    assert.equal(relatorio.firstOn, "2026-08-03");
    assert.equal(relatorio.lastOn, "2026-08-20");
    assert.equal(relatorio.workedDays, 3, "duas sessões no dia 5 contam um dia");
    assert.equal(relatorio.sessions, 4);
  });

  it("minutos entram sem perder precisão na soma", () => {
    // Oito sessões de 6 min: 0,1h cada. Somadas em decimal dariam
    // 0,7999999999999999; em milésimos dão 800, exatos.
    const seis = Array.from({ length: 8 }, (_, indice) =>
      sessao({ id: String(indice), duration: fromMinutes(6) }),
    );
    const relatorio = buildTimesheet(seis, cents(8_000));

    assert.equal(relatorio.worked, 800);
    assert.equal(relatorio.effectiveRate, 10_000, "R$ 80 por 0,8h dão R$ 100,00/h");
  });
});

describe("média de horas por projeto", () => {
  it("divide pelos projetos que têm tempo lançado", () => {
    // 30h em três projetos com tempo. O quarto, sem nada lançado, não entra no
    // divisor: incluí-lo diria que se trabalha 7,5h por projeto quando são 10.
    const media = averageHoursPerProject([fromHours(10), fromHours(15), fromHours(5), ZERO_MILLI]);
    assert.equal(media, 10);
  });

  it("nenhum projeto com tempo dá zero, não divisão por zero", () => {
    assert.equal(averageHoursPerProject([]), 0);
    assert.equal(averageHoursPerProject([ZERO_MILLI, ZERO_MILLI]), 0);
  });
});
