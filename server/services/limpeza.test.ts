/**
 * Apagar catálogo depois de apagar os lançamentos.
 *
 * O caso real: uma reimportação precisou esvaziar a conta e não conseguiu.
 * Categoria dava 500 e conta dava 409, as duas por motivos que nada tinham a
 * ver com o que o usuário via na tela — ele tinha apagado tudo.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

const AGORA = new Date("2026-09-10T12:00:00Z");

describe("limpeza de catálogo", () => {
  beforeEach(() => {
    zerar();
  });

  it("categoria com lançamento apagado é arquivada, não estoura", async () => {
    const { recordTransaction, removeTransaction } = await import("./transactions.ts");
    const { archiveCategory } = await import("./catalog.ts");
    const { listCategories } = await import("../repositories/catalog.ts");
    const alvo = await ambiente();

    const { ids } = await recordTransaction(
      alvo.userId,
      {
        kind: "expense",
        description: "Mercado",
        amount: cents(5_000),
        occurredOn: localDate("2026-09-01"),
        accountId: alvo.contaId,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );

    // A exclusão é lógica: a linha fica, com `deleted_at` preenchido.
    await removeTransaction(alvo.userId, ids[0]);

    // Antes, o contador ignorava a apagada, o serviço tentava apagar de fato e
    // a chave estrangeira `restrict` derrubava a requisição com erro interno.
    await archiveCategory(alvo.userId, alvo.categoriaId, AGORA);

    const restantes = await listCategories(alvo.userId);
    assert.equal(
      restantes.some((c) => c.id === alvo.categoriaId),
      false,
      "some da lista ativa",
    );
  });

  it("conta com lançamento apagado é arquivada, não estoura", async () => {
    const { recordTransaction, removeTransaction } = await import("./transactions.ts");
    const { archiveAccount } = await import("./catalog.ts");
    const { listAccounts } = await import("../repositories/catalog.ts");
    const alvo = await ambiente();

    const { ids } = await recordTransaction(
      alvo.userId,
      {
        kind: "expense",
        description: "Mercado",
        amount: cents(5_000),
        occurredOn: localDate("2026-09-01"),
        accountId: alvo.contaId,
        categoryId: alvo.categoriaId,
        state: "confirmed",
      },
      AGORA,
    );
    await removeTransaction(alvo.userId, ids[0]);

    // As entradas do razão somem com a exclusão, mas a transação continua
    // apontando para a conta com `restrict`.
    const resultado = await archiveAccount(alvo.userId, alvo.contaId, AGORA);
    assert.equal(resultado, "archived");
    assert.equal(
      (await listAccounts(alvo.userId)).some((c) => c.id === alvo.contaId),
      false,
    );
  });

  it("categoria nunca usada é apagada de vez", async () => {
    const { createCategory, archiveCategory } = await import("./catalog.ts");
    const { listCategories } = await import("../repositories/catalog.ts");
    const alvo = await ambiente();

    const nova = await createCategory(alvo.userId, { name: "Efêmera", kind: "expense" }, AGORA);
    await archiveCategory(alvo.userId, nova, AGORA);

    const todas = await listCategories(alvo.userId);
    assert.equal(todas.some((c) => c.id === nova), false);
  });

  it("cartão arquivado não segura a conta que o pagava", async () => {
    const { archiveCard, archiveAccount, createAccount, createCard } = await import("./catalog.ts");
    const alvo = await ambiente();

    const conta = await createAccount(
      alvo.userId,
      { name: "Conta do cartão", kind: "checking", openingBalance: cents(0) },
      AGORA,
    );
    const cartao = await createCard(
      alvo.userId,
      { name: "Cartão a arquivar", kind: "credit", paymentAccountId: conta, closingDay: 10, dueDay: 20 },
      AGORA,
    );

    await archiveCard(alvo.userId, cartao, AGORA);

    // O cartão saiu da vida do usuário, mas a referência dele continua no
    // banco: a conta é arquivada em vez de estourar.
    const resultado = await archiveAccount(alvo.userId, conta, AGORA);
    assert.equal(resultado, "archived");

    const { listAccounts } = await import("../repositories/catalog.ts");
    const ativas = await listAccounts(alvo.userId);
    assert.equal(ativas.some((c) => c.id === conta), false, "some da lista ativa");
  });

  it("cartão ativo continua segurando a conta", async () => {
    const { archiveAccount, createAccount, createCard } = await import("./catalog.ts");
    const alvo = await ambiente();

    const conta = await createAccount(
      alvo.userId,
      { name: "Conta com cartão", kind: "checking", openingBalance: cents(0) },
      AGORA,
    );
    await createCard(
      alvo.userId,
      { name: "Cartão ativo", kind: "credit", paymentAccountId: conta, closingDay: 10, dueDay: 20 },
      AGORA,
    );

    await assert.rejects(
      () => archiveAccount(alvo.userId, conta, AGORA),
      /cartões que pagam a fatura/,
    );
  });

  it("o saldo de abertura é corrigível sem apagar a conta", async () => {
    const { updateAccount } = await import("./catalog.ts");
    const { buildAccountsView } = await import("./accounts.ts");
    const alvo = await ambiente(500_000);

    await updateAccount(alvo.userId, alvo.contaId, { openingBalance: cents(123_45) }, AGORA);

    const view = await buildAccountsView(alvo.userId, AGORA);
    assert.equal(view.accounts.find((c) => c.id === alvo.contaId)?.balanceCents, 12_345);
  });
});
