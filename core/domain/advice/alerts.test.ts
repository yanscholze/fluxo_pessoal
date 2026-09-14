import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { localDate } from "../../time/local-date.ts";
import { type AlertInput, buildAlerts, classifyInvoices } from "./alerts.ts";

function entrada(overrides: Partial<AlertInput> = {}): AlertInput {
  return {
    today: localDate("2026-09-08"),
    pendingCaptures: 0,
    freeToSpendCents: 150_000,
    incomeThisMonthCents: 400_000,
    committedCents: 100_000,
    overdueInvoices: 0,
    overdueInvoiceCents: 0,
    nextInvoice: null,
    incomeToday: null,
    ...overrides,
  };
}

describe("classificação de faturas", () => {
  const fatura = (dueDate: string, amountCents = 50_000, cardName = "Nubank UV") => ({
    cardName,
    dueDate: localDate(dueDate),
    amountCents,
  });

  it("fechada e ainda não vencida não é fatura vencida", () => {
    /*
     * O caso que motivou esta função. O cartão fecha dia 12 e vence dia 20.
     * No dia 15 a fatura de setembro já saiu da competência ativa, e o painel
     * a devolve na lista de "overdue" — mas ela vence só dia 20.
     */
    const resultado = classifyInvoices([fatura("2026-09-20")], localDate("2026-09-15"));

    assert.equal(resultado.overdue.length, 0, "não passou do vencimento");
    assert.equal(resultado.overdueCents, 0);
    assert.equal(resultado.next?.dueDate, "2026-09-20");
  });

  it("no próprio dia do vencimento ainda dá para pagar", () => {
    const resultado = classifyInvoices([fatura("2026-09-20")], localDate("2026-09-20"));
    assert.equal(resultado.overdue.length, 0);
    assert.equal(resultado.next?.dueDate, "2026-09-20");
  });

  it("no dia seguinte, sim", () => {
    const resultado = classifyInvoices([fatura("2026-09-20")], localDate("2026-09-21"));
    assert.equal(resultado.overdue.length, 1);
    assert.equal(resultado.overdueCents, 50_000);
    assert.equal(resultado.next, null);
  });

  it("a próxima é a mais próxima entre todos os cartões", () => {
    const resultado = classifyInvoices(
      [
        fatura("2026-10-20", 90_000, "Nubank UV"),
        fatura("2026-09-25", 12_000, "Mercado Pago"),
        fatura("2026-11-05", 30_000, "XP Infinite"),
      ],
      localDate("2026-09-15"),
    );

    assert.equal(resultado.next?.cardName, "Mercado Pago");
  });

  it("soma o vencido de cartões diferentes", () => {
    const resultado = classifyInvoices(
      [fatura("2026-08-20", 40_000, "Nubank UV"), fatura("2026-09-05", 15_000, "Mercado Pago")],
      localDate("2026-09-15"),
    );

    assert.equal(resultado.overdue.length, 2);
    assert.equal(resultado.overdueCents, 55_000);
    assert.equal(resultado.next, null, "não há nenhuma a vencer");
  });

  it("sem fatura nenhuma não inventa próxima", () => {
    const resultado = classifyInvoices([], localDate("2026-09-15"));
    assert.deepEqual(resultado.overdue, []);
    assert.equal(resultado.overdueCents, 0);
    assert.equal(resultado.next, null);
  });
});

describe("alertas", () => {
  it("cala a boca quando não há nada a dizer", () => {
    assert.deepEqual(buildAlerts(entrada()), []);
  });

  it("põe o urgente antes do informativo", () => {
    const alertas = buildAlerts(
      entrada({
        overdueInvoices: 1,
        overdueInvoiceCents: 50_000,
        pendingCaptures: 3,
        incomeToday: { description: "Salário", amountCents: 400_000 },
      }),
    );

    assert.equal(alertas[0].severity, "urgente");
    assert.equal(alertas.at(-1)?.severity, "informativo");
  });

  it("avisa da fatura só dentro da janela", () => {
    const proxima = { cardName: "Nubank", dueDate: localDate("2026-09-30"), amountCents: 80_000 };
    assert.equal(
      buildAlerts(entrada({ nextInvoice: proxima })).some((a) => a.key.startsWith("fatura-vence")),
      false,
      "faltando 22 dias, avisar não muda decisão nenhuma",
    );

    const perto = { ...proxima, dueDate: localDate("2026-09-10") };
    const alertas = buildAlerts(entrada({ nextInvoice: perto }));
    assert.equal(alertas[0].key, "fatura-vence-2026-09-10-vespera");
    assert.equal(alertas[0].severity, "atencao");
  });

  it("a fatura que vence hoje é urgente, não atenção", () => {
    const alertas = buildAlerts(
      entrada({
        nextInvoice: { cardName: "Caju", dueDate: localDate("2026-09-08"), amountCents: 12_345 },
      }),
    );
    assert.equal(alertas[0].severity, "urgente");
    assert.match(alertas[0].title, /vence hoje/);
  });

  it("não confunde reembolso com salário", () => {
    const alertas = buildAlerts(
      entrada({ incomeToday: { description: "Reembolso", amountCents: 4_500 } }),
    );
    assert.equal(alertas.length, 0);
  });

  it("a chegada da renda mostra o que já está reservado, sem julgar", () => {
    const alertas = buildAlerts(
      entrada({
        incomeToday: { description: "Salário", amountCents: 400_000 },
        committedCents: 310_000,
        freeToSpendCents: 90_000,
      }),
    );

    const renda = alertas.find((a) => a.key.startsWith("renda-"));
    assert.ok(renda);
    assert.match(renda.body, /3\.100,00/);
    assert.match(renda.body, /900,00/);
    // Nada de "cuidado", "atenção" ou conselho não pedido no corpo.
    assert.doesNotMatch(renda.body, /cuidado|deveria|evite/i);
  });

  it("mês que não fecha vence o aviso de comprometimento", () => {
    const alertas = buildAlerts(entrada({ freeToSpendCents: -20_000, committedCents: 390_000 }));
    assert.equal(alertas.filter((a) => a.screen === "saude").length, 1);
    assert.equal(alertas[0].key, "livre-negativo-2026-09");
  });

  it("comprometimento alto só aparece com renda conhecida", () => {
    const semRenda = buildAlerts(entrada({ incomeThisMonthCents: 0, committedCents: 300_000 }));
    assert.equal(
      semRenda.some((a) => a.key.startsWith("comprometimento-alto")),
      false,
      "sem renda não há percentual — dividir por zero seria inventar diagnóstico",
    );

    const comRenda = buildAlerts(entrada({ incomeThisMonthCents: 400_000, committedCents: 300_000 }));
    const alerta = comRenda.find((a) => a.key.startsWith("comprometimento-alto"));
    assert.ok(alerta);
    assert.match(alerta.title, /75%/);
  });

  it("a captura avisa uma vez por dia, não uma por compra", () => {
    // A chave é o que o cliente usa para não repetir a notificação. Pela
    // contagem, cada compra nova viraria um aviso — o cartão apitando duas
    // vezes. Pela data, no máximo um lembrete por dia enquanto houver fila.
    const umaCaptura = buildAlerts(entrada({ pendingCaptures: 1 }))[0];
    const tresCapturas = buildAlerts(entrada({ pendingCaptures: 3 }))[0];
    assert.equal(umaCaptura.key, tresCapturas.key);
    assert.notEqual(umaCaptura.title, tresCapturas.title);

    const amanha = buildAlerts(
      entrada({ pendingCaptures: 3, today: localDate("2026-09-09") }),
    )[0];
    assert.notEqual(amanha.key, tresCapturas.key, "amanhã é outro episódio");
  });

  it("nenhuma chave é constante — senão o alerta avisa uma vez na vida", () => {
    /*
     * O defeito que este teste tranca. O celular guarda as chaves já
     * notificadas e nunca repete uma; uma chave sem discriminador nenhum
     * interromperia o usuário na primeira vez e ficaria muda para sempre,
     * porque a condição volta mas a chave não muda.
     */
    const setembro = buildAlerts(
      entrada({
        today: localDate("2026-09-08"),
        pendingCaptures: 2,
        freeToSpendCents: -1_000,
        committedCents: 390_000,
        overdueInvoices: 1,
        overdueInvoiceCents: 20_000,
        oldestOverdueDueDate: localDate("2026-08-20"),
      }),
    );
    const outubro = buildAlerts(
      entrada({
        today: localDate("2026-10-08"),
        pendingCaptures: 2,
        freeToSpendCents: -1_000,
        committedCents: 390_000,
        overdueInvoices: 1,
        overdueInvoiceCents: 20_000,
        oldestOverdueDueDate: localDate("2026-09-20"),
      }),
    );

    assert.ok(setembro.length >= 3);
    assert.equal(setembro.length, outubro.length);
    for (const [indice, alerta] of setembro.entries()) {
      assert.notEqual(
        alerta.key,
        outubro[indice].key,
        `"${alerta.key}" se repete de um mês para o outro e nunca mais avisaria`,
      );
    }
  });

  it("o aviso do dia do vencimento não é engolido pelo da véspera", () => {
    const vespera = buildAlerts(
      entrada({
        today: localDate("2026-09-18"),
        nextInvoice: { cardName: "Nubank UV", dueDate: localDate("2026-09-20"), amountCents: 80_000 },
      }),
    )[0];
    const noDia = buildAlerts(
      entrada({
        today: localDate("2026-09-20"),
        nextInvoice: { cardName: "Nubank UV", dueDate: localDate("2026-09-20"), amountCents: 80_000 },
      }),
    )[0];

    assert.equal(vespera.severity, "atencao");
    assert.equal(noDia.severity, "urgente");
    assert.notEqual(vespera.key, noDia.key, "mesma chave suprimiria o aviso do dia");
  });

  it("singular e plural saem certos", () => {
    assert.match(buildAlerts(entrada({ pendingCaptures: 1 }))[0].title, /^1 captura aguardando$/);
    assert.match(buildAlerts(entrada({ pendingCaptures: 2 }))[0].title, /^2 capturas aguardando$/);
    assert.match(
      buildAlerts(entrada({ overdueInvoices: 1, overdueInvoiceCents: 100 }))[0].title,
      /^Fatura vencida$/,
    );
    assert.match(
      buildAlerts(entrada({ overdueInvoices: 2, overdueInvoiceCents: 100 }))[0].title,
      /^Faturas vencidas$/,
    );
  });
});
