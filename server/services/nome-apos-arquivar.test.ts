/**
 * Nome reutilizável depois de arquivar.
 *
 * Nasceu de um estrago concreto: uma importação foi desfeita, a limpeza
 * arquivou conta, cartão e categoria, e a importação seguinte não conseguiu
 * mais usar os mesmos nomes. O resultado foram "Nubank Conta (2)" e
 * "Combustível 2" na conta de produção do dono, sem nenhuma forma de desfazer —
 * renomear o arquivado exige alcançá-lo, e arquivado não aparece na interface.
 *
 * Arquivar tira de cena. O que saiu de cena não reserva nome.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import { cents } from "../../core/kernel/money.ts";
import { localDate } from "../../core/time/local-date.ts";
import { ambiente, zerar } from "../testing/cenario.ts";

describe("nome livre depois de arquivar", () => {
  beforeEach(() => zerar());

  it("a categoria arquivada libera o nome", async () => {
    const { createCategory, archiveCategory } = await import("./catalog.ts");
    const alvo = await ambiente();

    const primeira = await createCategory(alvo.userId, { name: "Combustível", kind: "expense" });
    await archiveCategory(alvo.userId, primeira);

    const segunda = await createCategory(alvo.userId, { name: "Combustível", kind: "expense" });
    assert.notEqual(segunda, primeira);
  });

  it("a categoria ativa continua recusando nome repetido", async () => {
    const { createCategory } = await import("./catalog.ts");
    const { DomainError } = await import("../../core/kernel/errors.ts");
    const alvo = await ambiente();

    await createCategory(alvo.userId, { name: "Mercado livre", kind: "expense" });
    await assert.rejects(
      () => createCategory(alvo.userId, { name: "Mercado livre", kind: "expense" }),
      DomainError,
    );
  });

  it("a conta arquivada libera o nome", async () => {
    const { createAccount, archiveAccount } = await import("./catalog.ts");
    const alvo = await ambiente();

    const primeira = await createAccount(alvo.userId, {
      name: "Nubank Conta",
      kind: "checking",
      openingBalance: cents(0),
      openedOn: localDate("2026-01-01"),
    });
    await archiveAccount(alvo.userId, primeira);

    const segunda = await createAccount(alvo.userId, {
      name: "Nubank Conta",
      kind: "checking",
      openingBalance: cents(0),
      openedOn: localDate("2026-01-01"),
    });
    assert.notEqual(segunda, primeira);
  });

  it("o cartão arquivado libera o nome", async () => {
    const { createCard, archiveCard } = await import("./catalog.ts");
    const alvo = await ambiente();

    const primeiro = await createCard(alvo.userId, {
      name: "Nubank",
      kind: "credit",
      paymentAccountId: alvo.contaId,
      closingDay: 12,
      dueDay: 20,
    });
    await archiveCard(alvo.userId, primeiro);

    const segundo = await createCard(alvo.userId, {
      name: "Nubank",
      kind: "credit",
      paymentAccountId: alvo.contaId,
      closingDay: 12,
      dueDay: 20,
    });
    assert.notEqual(segundo, primeiro);
  });
});
