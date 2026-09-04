/**
 * Recorrência: projetar, confirmar, não duplicar.
 *
 * A recorrência é a única regra do Fluxo que produz lançamento sem ninguém
 * pedir. Enquanto é projeção, ela vive só em memória — o painel a calcula a
 * cada leitura e nada é gravado. Quando o usuário confirma que aconteceu, ela
 * vira linha no banco e a projeção precisa **sumir**, ou o salário aparece
 * duas vezes: uma como fato e outra como previsão.
 *
 * A versão anterior gravava treze meses de previsão no banco como efeito
 * colateral de uma leitura, e editar a regra deixava as previsões velhas para
 * trás. Estes testes fixam o desenho novo.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { competence } from "../../core/time/competence.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-08-20T12:00:00Z");

async function salarioMensal(userId: string, contaId: string, categoriaId: string) {
  const { createRecurrence } = await import("./recurrences.ts");
  return createRecurrence(
    userId,
    {
      kind: "income",
      role: "salary",
      description: "Salário",
      amount: cents(620_000),
      scheduleDay: 5,
      accountId: contaId,
      categoryId: categoriaId,
      startsOn: localDate("2026-01-01"),
    },
    AGORA,
  );
}

describe("recorrência", () => {
  beforeEach(() => zerar());

  it("projeta sem gravar nada no razão", async () => {
    const { listTransactions } = await import("../repositories/ledger.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();
    await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);

    const painel = await buildDashboard(alvo.userId, AGORA);
    assert.ok(
      painel.upcoming.some((item) => item.description === "Salário"),
      "a projeção precisa aparecer nos próximos compromissos",
    );

    const lancamentos = await listTransactions(alvo.userId, { limit: 100 });
    assert.equal(lancamentos.length, 0, "ler o painel não pode gravar previsão no banco");
  });

  it("confirmar cria o lançamento e move o saldo", async () => {
    const { confirmOccurrence } = await import("./recurrences.ts");
    const { buildAccountsView } = await import("./accounts.ts");
    const alvo = await ambiente(100_000);
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);

    const confirmada = await confirmOccurrence(alvo.userId, regra, competence("2026-08"), {}, AGORA);
    assert.equal(confirmada.amountCents, 620_000);
    assert.equal(confirmada.alreadyConfirmed, false);

    const view = await buildAccountsView(alvo.userId, AGORA);
    const conta = view.accounts.find((item) => item.id === alvo.contaId);
    assert.equal(conta?.balanceCents, 720_000, "o salário confirmado entra no saldo");
  });

  it("confirmar duas vezes não duplica o lançamento", async () => {
    const { confirmOccurrence } = await import("./recurrences.ts");
    const { listTransactions } = await import("../repositories/ledger.ts");
    const alvo = await ambiente(100_000);
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);

    await confirmOccurrence(alvo.userId, regra, competence("2026-08"), {}, AGORA);
    const segunda = await confirmOccurrence(alvo.userId, regra, competence("2026-08"), {}, AGORA);

    assert.equal(segunda.alreadyConfirmed, true, "a segunda confirmação é reconhecida como repetida");

    const lancamentos = await listTransactions(alvo.userId, { limit: 100 });
    assert.equal(lancamentos.length, 1, "a competência confirmada tem um lançamento, não dois");
  });

  it("a ocorrência confirmada some da projeção", async () => {
    const { confirmOccurrence } = await import("./recurrences.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente(100_000);
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);

    await confirmOccurrence(alvo.userId, regra, competence("2026-08"), {}, AGORA);
    const painel = await buildDashboard(alvo.userId, AGORA);

    const virtuaisDeAgosto = painel.upcoming.filter(
      (item) => item.description === "Salário" && item.transactionId.startsWith("virtual:"),
    );
    const dobrado = virtuaisDeAgosto.some((item) => item.transactionId.includes("2026-08"));

    assert.equal(dobrado, false, "salário confirmado não pode continuar projetado na mesma competência");
  });

  it("confirmar aceita um valor diferente do previsto", async () => {
    const { confirmOccurrence } = await import("./recurrences.ts");
    const alvo = await ambiente(100_000);
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);

    const confirmada = await confirmOccurrence(
      alvo.userId,
      regra,
      competence("2026-08"),
      { amount: cents(590_000) },
      AGORA,
    );

    assert.equal(confirmada.amountCents, 590_000, "o valor real manda sobre o previsto");
  });

  it("desativar a regra tira a projeção do painel", async () => {
    const { setRecurrenceActive } = await import("./recurrences.ts");
    const { buildDashboard } = await import("./dashboard.ts");
    const alvo = await ambiente();
    const regra = await salarioMensal(alvo.userId, alvo.contaId, alvo.categoriaId);

    await setRecurrenceActive(alvo.userId, regra, false, AGORA);
    const painel = await buildDashboard(alvo.userId, AGORA);

    assert.equal(
      painel.upcoming.some((item) => item.description === "Salário"),
      false,
      "regra desativada não projeta",
    );
  });

  it("recusa confirmar competência anterior à vigência", async () => {
    const { createRecurrence, confirmOccurrence } = await import("./recurrences.ts");
    const alvo = await ambiente();

    const regra = await createRecurrence(
      alvo.userId,
      {
        kind: "expense",
        description: "Aluguel",
        amount: cents(195_000),
        scheduleDay: 10,
        accountId: alvo.contaId,
        categoryId: alvo.categoriaId,
        startsOn: localDate("2026-06-01"),
      },
      AGORA,
    );

    await assert.rejects(
      () => confirmOccurrence(alvo.userId, regra, competence("2026-01"), {}, AGORA),
      /competência/i,
    );
  });
});
