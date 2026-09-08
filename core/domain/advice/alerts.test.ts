import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { localDate } from "../../time/local-date.ts";
import { type AlertInput, buildAlerts } from "./alerts.ts";

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
    assert.equal(alertas[0].key, "fatura-vence-2026-09-10");
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
    assert.equal(alertas[0].key, "livre-negativo");
  });

  it("comprometimento alto só aparece com renda conhecida", () => {
    const semRenda = buildAlerts(entrada({ incomeThisMonthCents: 0, committedCents: 300_000 }));
    assert.equal(
      semRenda.some((a) => a.key === "comprometimento-alto"),
      false,
      "sem renda não há percentual — dividir por zero seria inventar diagnóstico",
    );

    const comRenda = buildAlerts(entrada({ incomeThisMonthCents: 400_000, committedCents: 300_000 }));
    const alerta = comRenda.find((a) => a.key === "comprometimento-alto");
    assert.ok(alerta);
    assert.match(alerta.title, /75%/);
  });

  it("a chave da fatura muda com o vencimento, e a das capturas não", () => {
    // A chave é o que o cliente usa para não repetir a notificação. A da
    // fatura precisa mudar quando a fatura muda; a das capturas, não — senão
    // cada compra nova viraria um aviso.
    const umaCaptura = buildAlerts(entrada({ pendingCaptures: 1 }))[0];
    const tresCapturas = buildAlerts(entrada({ pendingCaptures: 3 }))[0];
    assert.equal(umaCaptura.key, tresCapturas.key);
    assert.notEqual(umaCaptura.title, tresCapturas.title);
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
