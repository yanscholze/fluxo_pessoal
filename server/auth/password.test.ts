/**
 * Senhas.
 *
 * O que este arquivo existe para não repetir: o custo do hash era 210 mil
 * iterações, o valor que o OWASP recomenda — e o runtime da Cloudflare recusa
 * acima de cem mil. Local passava, produção respondia 500 em todo cadastro e
 * todo login, e a causa só aparecia no log do worker: `Pbkdf2 failed:
 * iteration counts above 100000 are not supported`.
 *
 * Um teto de plataforma não se descobre lendo o código; se descobre quando o
 * primeiro usuário não consegue criar conta.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_ITERATIONS, MAX_ITERATIONS, hashPassword, needsRehash, verifyPassword } from "./password.ts";

describe("custo do hash", () => {
  it("não passa do que o runtime aceita", () => {
    assert.ok(
      DEFAULT_ITERATIONS <= MAX_ITERATIONS,
      `${DEFAULT_ITERATIONS} iterações: o Workers recusa acima de ${MAX_ITERATIONS}`,
    );
  });

  it("continua sendo um custo sério", () => {
    // Abaixo disto o hash deixa de proteger contra força bruta offline. Se um
    // dia for preciso baixar mais, o problema é a escolha do algoritmo, não o
    // número.
    assert.ok(DEFAULT_ITERATIONS >= 100_000, `${DEFAULT_ITERATIONS} é baixo demais`);
  });
});

describe("verificação", () => {
  it("a senha certa passa e a errada não", async () => {
    const registro = await hashPassword("senha-de-teste-123");

    assert.equal(await verifyPassword("senha-de-teste-123", registro), true);
    assert.equal(await verifyPassword("senha-de-teste-124", registro), false);
    assert.equal(await verifyPassword("", registro), false);
  });

  it("a mesma senha gera hashes diferentes", async () => {
    // Sal por usuário: duas contas com a mesma senha não podem ter o mesmo
    // hash, senão uma tabela pronta quebra as duas de uma vez.
    const um = await hashPassword("senha-de-teste-123");
    const outro = await hashPassword("senha-de-teste-123");

    assert.notEqual(um.hash, outro.hash);
    assert.notEqual(um.salt, outro.salt);
  });

  it("uma senha gravada com outro custo continua válida", async () => {
    // É o que permite mudar o padrão sem deslogar ninguém: o número de
    // iterações fica gravado com o hash, e a verificação usa o gravado.
    const antiga = await hashPassword("senha-de-teste-123", 60_000);

    assert.equal(antiga.iterations, 60_000);
    assert.equal(await verifyPassword("senha-de-teste-123", antiga), true);
    assert.equal(needsRehash(antiga), true, "deveria ser reforçada no próximo login");
  });

  it("a senha gravada com o custo atual não pede reforço", async () => {
    const atual = await hashPassword("senha-de-teste-123");
    assert.equal(needsRehash(atual), false);
  });

  it("registro corrompido é senha inválida, não exceção", async () => {
    // Um hash ilegível no banco não pode derrubar a rota de login: ele apenas
    // não confere.
    const quebrado = { hash: "não é base64 %%%", salt: "%%%", iterations: DEFAULT_ITERATIONS };
    assert.equal(await verifyPassword("qualquer-senha-123", quebrado), false);
  });
});
