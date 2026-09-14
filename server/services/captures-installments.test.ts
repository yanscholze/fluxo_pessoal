/** A confirmação de uma captura parcelada precisa criar o cronograma inteiro. */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-09-14T12:00:00Z");

describe("captura de compra parcelada", () => {
  beforeEach(() => zerar());

  it("usa a quantidade ajustada na revisão para criar parcelas reais", async () => {
    const { ingest, buildCapturesView, confirmCapture } = await import("./captures.ts");
    const { buildInstallmentsView } = await import("./installments.ts");
    const alvo = await ambiente();

    await ingest(
      alvo.userId,
      [
        {
          sourceApp: "com.nu.production",
          title: "Compra no cartão de crédito",
          text: "Compra aprovada de R$ 1.200,00 em 12 parcelas para STEAM",
          postedAt: AGORA.getTime(),
          deviceEventId: "captura-steam-12x",
        },
      ],
      AGORA,
    );

    const capture = (await buildCapturesView(alvo.userId, AGORA)).pending[0];
    assert.deepEqual(capture?.installment, { current: 1, total: 12 }, "a notificação informa as 12x");

    await confirmCapture(
      alvo.userId,
      capture!.id,
      { cardId: alvo.cartaoId, categoryId: alvo.categoriaId, installmentCount: 6 },
      AGORA,
    );

    const plano = (await buildInstallmentsView(alvo.userId, AGORA)).active[0];
    assert.equal(plano?.totalCount, 6, "a alteração antes de confirmar é respeitada");
    assert.equal(plano?.totalAmount, cents(120_000));
    assert.equal(plano?.entries.reduce((total, item) => total + item.amountCents, 0), 120_000);
  });
});
