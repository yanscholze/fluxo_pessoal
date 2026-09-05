/**
 * A leitura do corpo da requisição.
 *
 * O que precisa ficar preso aqui é a **consistência**: o mesmo campo, escrito
 * do mesmo jeito, tem de ser aceito por todas as rotas. Um cliente que manda
 * `{"billable": false}` e recebe 400 numa rota depois de ter recebido 201 em
 * outra não tem como descobrir a regra — ela não está em lugar nenhum.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { read } from "./input.ts";

describe("booleano", () => {
  it("aceita as três formas que um cliente honesto manda", () => {
    for (const [valor, esperado] of [
      [true, true],
      [false, false],
      ["true", true],
      ["false", false],
      [1, true],
      [0, false],
    ] as const) {
      const entrada = read({ campo: valor });
      assert.equal(entrada.optionalBoolean("campo"), esperado, JSON.stringify(valor));
    }
  });

  it("campo ausente é diferente de campo falso", () => {
    // A distinção é a razão de o opcional existir: num PATCH, "não mandou" tem
    // de deixar o valor como está, e `false` tem de gravar `false`.
    assert.equal(read({}).optionalBoolean("campo"), null);
    assert.equal(read({ campo: null }).optionalBoolean("campo"), null);
    assert.equal(read({ campo: "" }).optionalBoolean("campo"), null);
    assert.equal(read({ campo: false }).optionalBoolean("campo"), false);
  });

  it("recusa o que não é booleano em vez de adivinhar", () => {
    // "sim" e "1,0" parecem verdadeiros e não são: aceitar produziria um
    // registro gravado ao contrário do que o cliente quis dizer.
    for (const valor of ["sim", "yes", "2", {}, []]) {
      const entrada = read({ campo: valor });
      entrada.optionalBoolean("campo");
      assert.throws(() => entrada.done(), /Revise os campos/, JSON.stringify(valor));
    }
  });

  it("o obrigatório e o opcional leem o mesmo valor do mesmo jeito", () => {
    // É a garantia contra o defeito que motivou este arquivo: `POST` usava
    // `boolean()` e `PATCH` usava uma lista de strings, e as duas rotas
    // discordavam sobre o mesmo campo.
    for (const valor of [true, false, "true", "false", 1, 0]) {
      assert.equal(
        read({ campo: valor }).boolean("campo"),
        read({ campo: valor }).optionalBoolean("campo"),
        JSON.stringify(valor),
      );
    }
  });
});
