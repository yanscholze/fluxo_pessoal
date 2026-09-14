import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { competence } from "../../core/time/competence.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-09-20T12:00:00Z");

describe("extrato de uma fatura", () => {
  beforeEach(() => zerar());

  it("traz apenas os lançamentos do cartão e da competência escolhidos", async () => {
    const { createCard } = await import("./catalog.ts");
    const { buildStatement } = await import("./statement.ts");
    const { payInvoice, recordTransaction } = await import("./transactions.ts");
    const alvo = await ambiente(500_000);
    const outroCartao = await createCard(alvo.userId, {
      name: "Outro cartão",
      kind: "credit",
      paymentAccountId: alvo.contaId,
      closingDay: 13,
      dueDay: 20,
      limit: cents(500_000),
    });

    await recordTransaction(
      alvo.userId,
      {
        kind: "expense",
        description: "Compra da fatura escolhida",
        amount: cents(12_000),
        occurredOn: localDate("2026-08-14"),
        cardId: alvo.cartaoId,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );
    await recordTransaction(
      alvo.userId,
      {
        kind: "expense",
        description: "Compra da fatura anterior",
        amount: cents(8_000),
        occurredOn: localDate("2026-08-10"),
        cardId: alvo.cartaoId,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );
    await recordTransaction(
      alvo.userId,
      {
        kind: "expense",
        description: "Compra de outro cartão",
        amount: cents(7_000),
        occurredOn: localDate("2026-08-14"),
        cardId: outroCartao,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );
    await payInvoice(
      alvo.userId,
      {
        cardId: alvo.cartaoId,
        competence: competence("2026-09"),
        accountId: alvo.contaId,
        paidOn: localDate("2026-09-20"),
      },
      AGORA,
    );

    const statement = await buildStatement(
      alvo.userId,
      { competence: competence("2026-09"), cardId: alvo.cartaoId },
      AGORA,
    );

    assert.deepEqual(
      statement.rows.map((row) => row.description).sort(),
      ["Compra da fatura escolhida", "Pagamento da fatura 2026-09 · Cartão de Teste"].sort(),
    );
    assert.equal(statement.expenseCents, 12_000);
  });
});
