/**
 * Correção de cartão.
 *
 * O caso que obriga a edição a existir é o dia de fechamento digitado errado.
 * Ele decide em qual fatura cada compra cai — errado, todas as competências
 * saem erradas, e sem edição a única saída seria apagar o cartão e perder o
 * histórico junto.
 *
 * O que precisa ficar preso aqui é o limite do conserto: mudar o ciclo não
 * pode reescrever fatura que já fechou. Aquela recebeu compras sob a regra
 * antiga, e mover a data dela mudaria retroativamente onde elas caíram.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-09-10T12:00:00Z");

describe("correção de cartão", () => {
  beforeEach(() => {
    zerar();
  });

  it("corrige nome, cor e limite sem tocar no ciclo", async () => {
    const { updateCard } = await import("./catalog.ts");
    const { listCards } = await import("../repositories/catalog.ts");
    const alvo = await ambiente();

    await updateCard(
      alvo.userId,
      alvo.cartaoId,
      { name: "Cartão renomeado", color: "#6d4bd8", limit: cents(2_000_00) },
      AGORA,
    );

    const [cartao] = await listCards(alvo.userId);
    assert.equal(cartao.name, "Cartão renomeado");
    assert.equal(cartao.color, "#6d4bd8");
    assert.equal(cartao.limitCents, 200_000);
    assert.equal(cartao.closingDay, 13, "o ciclo não muda sozinho");
  });

  it("recusa ciclo inválido em vez de gravar um cartão que não fecha", async () => {
    const { updateCard } = await import("./catalog.ts");
    const alvo = await ambiente();

    await assert.rejects(() => updateCard(alvo.userId, alvo.cartaoId, { closingDay: 40 }, AGORA));
    await assert.rejects(() => updateCard(alvo.userId, alvo.cartaoId, { dueDay: 0 }, AGORA));
  });

  it("recusa nome já usado por outro cartão", async () => {
    const { createCard, updateCard } = await import("./catalog.ts");
    const alvo = await ambiente();

    const outro = await createCard(
      alvo.userId,
      {
        name: "Segundo cartão",
        kind: "credit",
        paymentAccountId: alvo.contaId,
        closingDay: 5,
        dueDay: 15,
      },
      AGORA,
    );

    await assert.rejects(
      () => updateCard(alvo.userId, outro, { name: "Cartão de Teste" }, AGORA),
      /Já existe um cartão/,
    );
  });

  it("mudar o fechamento reagenda a fatura que ainda não fechou", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { updateCard } = await import("./catalog.ts");
    const { buildCardsView } = await import("./cards.ts");
    const alvo = await ambiente();

    // Fecha dia 13, vence dia 20. Uma compra em outubro cria a fatura de
    // outubro, que ainda não fechou em 10 de setembro.
    await recordTransaction(
      alvo.userId,
      {
        kind: "expense",
        description: "Compra futura",
        amount: cents(10_000),
        occurredOn: localDate("2026-10-05"),
        cardId: alvo.cartaoId,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );

    await updateCard(alvo.userId, alvo.cartaoId, { closingDay: 20, dueDay: 28 }, AGORA);

    const view = await buildCardsView(alvo.userId, AGORA);
    const cartao = view.cards.find((linha) => linha.id === alvo.cartaoId);
    const outubro = cartao?.invoices?.find((fatura) => fatura.competence === "2026-10");

    assert.ok(outubro, "a fatura de outubro precisa existir");
    assert.equal(outubro.closingDate, "2026-10-20", "reagendada para o novo fechamento");
    assert.equal(outubro.dueDate, "2026-10-28");
  });

  it("a fatura cujo fechamento já passou não é remexida", async () => {
    const { recordTransaction } = await import("./transactions.ts");
    const { updateCard } = await import("./catalog.ts");
    const { buildCardsView } = await import("./cards.ts");
    const alvo = await ambiente();

    // Agosto fechou em 13/08 — antes de "hoje", que é 10/09. As compras dela
    // entraram sob a regra antiga e não podem mudar de fatura agora.
    await recordTransaction(
      alvo.userId,
      {
        kind: "expense",
        description: "Compra de agosto",
        amount: cents(5_000),
        occurredOn: localDate("2026-08-05"),
        cardId: alvo.cartaoId,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );

    await updateCard(alvo.userId, alvo.cartaoId, { closingDay: 20, dueDay: 28 }, AGORA);

    const view = await buildCardsView(alvo.userId, AGORA);
    const cartao = view.cards.find((linha) => linha.id === alvo.cartaoId);
    const agosto = cartao?.invoices?.find((fatura) => fatura.competence === "2026-08");

    assert.ok(agosto, "a fatura de agosto precisa continuar existindo");
    assert.equal(agosto.closingDate, "2026-08-13", "a data de quem já fechou é fato");
    assert.equal(agosto.dueDate, "2026-08-20");
  });

  it("o cartão de um usuário não é editável por outro", async () => {
    const { updateCard } = await import("./catalog.ts");
    const { signUp } = await import("./auth.ts");
    const alvo = await ambiente();

    const { user: outro } = await signUp({
      email: "outro@fluxo.app",
      password: "senha-de-teste-123",
      displayName: "Outra Pessoa",
    });

    await assert.rejects(
      () => updateCard(outro.id, alvo.cartaoId, { name: "Roubado" }, AGORA),
      /Cartão/,
    );
  });
});
