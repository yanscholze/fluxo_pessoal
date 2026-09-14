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
      assert.throws(() => entrada.done(), /verdadeiro ou falso/, JSON.stringify(valor));
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

describe("lista", () => {
  it("marca o campo como lido — senão `done()` reprova a rota inteira", () => {
    /*
     * O defeito que motivou este método. A rota de parcelamento lia
     * `body.parcels` direto, fora do leitor, e por isso o campo nunca entrava
     * em `lidos`: `done()` o denunciava como "não reconhecido" e a rota
     * devolvia 400 em **toda** chamada, inclusive nas corretas.
     *
     * O script de importação chegou a ser escrito contra essa rota. Ele apaga
     * lançamentos antes de recriá-los como plano — teria apagado tudo e falhado
     * na primeira criação.
     */
    const entrada = read({ parcels: [{ number: 1 }] });
    assert.equal(entrada.list("parcels").length, 1);
    assert.doesNotThrow(() => entrada.done());
  });

  it("recusa o que não é lista", () => {
    for (const valor of ["1", 3, {}, null]) {
      const entrada = read({ campo: valor });
      entrada.list("campo");
      assert.throws(() => entrada.done(), /Envie uma lista/, JSON.stringify(valor));
    }
  });

  it("cobra o tamanho declarado", () => {
    const vazia = read({ campo: [] });
    vazia.list("campo", { min: 1 });
    assert.throws(() => vazia.done(), /ao menos 1 item/);

    const demais = read({ campo: [1, 2, 3] });
    demais.list("campo", { max: 2 });
    assert.throws(() => demais.done(), /no máximo 2 itens/);

    const certa = read({ campo: [1, 2] });
    certa.list("campo", { min: 1, max: 2 });
    assert.doesNotThrow(() => certa.done());
  });

  it("perguntar se a chave veio também é lê-la", () => {
    // `provided` é a única leitura que não devolve valor. Antes ela não
    // registrava nada, então uma rota que só perguntasse teria o campo
    // recusado por `done()` — o mesmo defeito da lista, por outra porta.
    const entrada = read({ campo: null });
    assert.equal(entrada.provided("campo"), true);
    assert.doesNotThrow(() => entrada.done());
  });
});

/**
 * A mensagem que chega na tela.
 *
 * Várias telas mostram só `error.message` e ignoram `issues` — e "revise os
 * campos destacados" numa tela que não destaca campo nenhum é uma frase que
 * não informa nada. Com um problema só, a mensagem geral passa a ser esse
 * problema; com vários, aí sim vale pedir revisão.
 */
describe("mensagem da validação", () => {
  it("com um problema só, fala do problema", () => {
    const entrada = read({ quantidade: "abc" });
    entrada.scaled("quantidade", { scale: 3 });
    assert.throws(() => entrada.done(), /Informe um número válido/);
  });

  it("com mais de um, pede revisão e lista os campos", () => {
    const entrada = read({ quantidade: "abc", nome: "" });
    entrada.scaled("quantidade", { scale: 3 });
    entrada.string("nome");

    assert.throws(
      () => entrada.done(),
      (erro: unknown) => {
        const falha = erro as { message: string; issues: readonly { path: string }[] };
        assert.match(falha.message, /Revise os campos destacados/);
        assert.deepEqual(
          falha.issues.map((problema) => problema.path),
          ["quantidade", "nome"],
        );
        return true;
      },
    );
  });

  it("a rota ainda pode dizer a frase dela", () => {
    const entrada = read({ quantidade: "abc" });
    entrada.scaled("quantidade", { scale: 3 });
    assert.throws(() => entrada.done("Não foi possível registrar o resgate"), /registrar o resgate/);
  });
});
