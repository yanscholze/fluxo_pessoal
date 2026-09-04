/**
 * A régua da baixa automática.
 *
 * A decisão de produto que estes testes fixam: **só casamento perfeito e único
 * vira baixa**. Tudo o mais vira sugestão. Se alguém afrouxar isso para
 * "resolver mais casos sozinho", é aqui que quebra — e é de propósito.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "../../kernel/money.ts";
import { localDate } from "../../time/local-date.ts";
import {
  type KnownSubscription,
  type ReceiptCandidate,
  matchReceipt,
  matchSubscription,
  samePayer,
} from "./reconcile.ts";

function parcela(overrides: Partial<ReceiptCandidate> = {}): ReceiptCandidate {
  return {
    target: {
      kind: "project",
      paymentId: "parcela-1",
      projectId: "projeto-1",
      projectName: "Site institucional",
    },
    ruleId: "regra-1",
    payerName: "Padaria do Bairro",
    expectedAmount: cents(300_000),
    dueOn: localDate("2026-09-10"),
    accountId: "conta-1",
    categoryId: "cat-1",
    ...overrides,
  };
}

describe("nomes equivalentes", () => {
  it("aceita o sufixo societário que o extrato acrescenta", () => {
    assert.equal(samePayer("Padaria do Bairro", "PADARIA DO BAIRRO LTDA"), true);
    assert.equal(samePayer("Padaria do Bairro", "Padaria do Bairro ME"), true);
  });

  it("ignora acento e caixa", () => {
    assert.equal(samePayer("Construções Silva", "CONSTRUCOES SILVA"), true);
  });

  it("recusa nome parecido que não é o mesmo", () => {
    assert.equal(samePayer("Padaria do Bairro", "Padaria Central"), false);
    assert.equal(samePayer("Mercado Sol", "Mercado Lua"), false);
  });

  it("nome curto exige igualdade, para não casar por acaso", () => {
    // "ana" dentro de "santana", "banana", "ana paula" — todos falsos
    // positivos que custariam uma baixa no lugar errado.
    assert.equal(samePayer("Ana", "SANTANA COMERCIO"), false);
    assert.equal(samePayer("Ana", "ANA PAULA SOUZA"), false);
    assert.equal(samePayer("Ana", "ana"), true);
  });

  it("nome vazio nunca casa", () => {
    assert.equal(samePayer("", "QUALQUER COISA"), false);
    assert.equal(samePayer("Padaria", ""), false);
  });
});

describe("baixa automática", () => {
  it("acontece quando nome e valor batem exatamente", () => {
    const resultado = matchReceipt(
      { payer: "PADARIA DO BAIRRO LTDA", amount: cents(300_000) },
      [parcela()],
    );

    assert.equal(resultado.kind, "exact");
    assert.equal(resultado.kind === "exact" && resultado.candidate.target.kind, "project");
  });

  it("não acontece por um centavo de diferença", () => {
    const resultado = matchReceipt(
      { payer: "PADARIA DO BAIRRO LTDA", amount: cents(299_999) },
      [parcela()],
    );

    assert.equal(resultado.kind, "suggested");
    assert.equal(resultado.kind === "suggested" && resultado.reason, "valor_diferente");
  });

  it("não acontece com dois candidatos iguais", () => {
    // Duas parcelas idênticas do mesmo contrato: escolher uma seria palpite.
    const resultado = matchReceipt({ payer: "Padaria do Bairro", amount: cents(300_000) }, [
      parcela({ target: { kind: "project", paymentId: "p1", projectId: "x", projectName: "Site" }, dueOn: localDate("2026-10-10") }),
      parcela({ target: { kind: "project", paymentId: "p2", projectId: "x", projectName: "Site" }, dueOn: localDate("2026-09-10") }),
    ]);

    assert.equal(resultado.kind, "suggested");
    assert.equal(resultado.kind === "suggested" && resultado.reason, "varios_candidatos");
    // Sugere a que vence primeiro, mas não dá baixa.
    assert.equal(
      resultado.kind === "suggested" && resultado.candidate.target.kind === "project"
        ? resultado.candidate.target.paymentId
        : null,
      "p2",
    );
  });

  it("não acontece para salário, que não tem valor esperado", () => {
    const resultado = matchReceipt({ payer: "ACME TECNOLOGIA LTDA", amount: cents(620_000) }, [
      {
        target: { kind: "salary" },
        ruleId: "regra-salario",
        payerName: "Acme Tecnologia",
        expectedAmount: null,
        dueOn: null,
        accountId: "conta-1",
        categoryId: "cat-salario",
      },
    ]);

    assert.equal(resultado.kind, "suggested");
    assert.equal(resultado.kind === "suggested" && resultado.reason, "sem_valor_esperado");
  });

  it("o valor certo do cliente errado não casa", () => {
    // O número bate, o nome não. Sem o filtro por nome, este pix daria baixa
    // na parcela de outra pessoa.
    const resultado = matchReceipt({ payer: "OUTRA EMPRESA SA", amount: cents(300_000) }, [parcela()]);
    assert.equal(resultado.kind, "none");
  });

  it("notificação sem pagador identificado não casa com nada", () => {
    const resultado = matchReceipt({ payer: null, amount: cents(300_000) }, [parcela()]);
    assert.equal(resultado.kind, "none");
  });

  it("sem candidatos cadastrados, não há o que conciliar", () => {
    const resultado = matchReceipt({ payer: "PADARIA DO BAIRRO", amount: cents(300_000) }, []);
    assert.equal(resultado.kind, "none");
  });

  it("escolhe entre projetos diferentes do mesmo pagador pelo valor", () => {
    const resultado = matchReceipt({ payer: "Padaria do Bairro", amount: cents(150_000) }, [
      parcela({
        target: { kind: "project", paymentId: "site", projectId: "a", projectName: "Site" },
        expectedAmount: cents(300_000),
      }),
      parcela({
        target: { kind: "project", paymentId: "app", projectId: "b", projectName: "App" },
        expectedAmount: cents(150_000),
      }),
    ]);

    assert.equal(resultado.kind, "exact");
    assert.equal(
      resultado.kind === "exact" && resultado.candidate.target.kind === "project"
        ? resultado.candidate.target.paymentId
        : null,
      "app",
    );
  });
});

describe("assinatura reconhecida", () => {
  const netflix: KnownSubscription = {
    recurrenceId: "assinatura-netflix",
    description: "Netflix",
    amount: cents(5_590),
    cardId: "cartao-1",
  };

  it("reconhece a cobrança pelo nome", () => {
    const encontrada = matchSubscription({ merchant: "NETFLIX.COM", amount: cents(5_590) }, [netflix]);
    assert.equal(encontrada?.recurrenceId, "assinatura-netflix");
  });

  it("reconhece mesmo com o valor reajustado", () => {
    // O dano de errar aqui é a cobrança aparecer na aba errada, não dinheiro
    // registrado — então o valor não precisa bater.
    const encontrada = matchSubscription({ merchant: "NETFLIX", amount: cents(6_290) }, [netflix]);
    assert.equal(encontrada?.recurrenceId, "assinatura-netflix");
  });

  it("desempata pelo valor quando há duas com nome parecido", () => {
    const premium: KnownSubscription = {
      recurrenceId: "netflix-premium",
      description: "Netflix Premium",
      amount: cents(9_990),
      cardId: "cartao-1",
    };

    const encontrada = matchSubscription({ merchant: "NETFLIX PREMIUM", amount: cents(9_990) }, [
      netflix,
      premium,
    ]);
    assert.equal(encontrada?.recurrenceId, "netflix-premium");
  });

  it("compra comum não vira assinatura", () => {
    assert.equal(matchSubscription({ merchant: "PADARIA CENTRAL", amount: cents(1_200) }, [netflix]), null);
  });

  it("sem estabelecimento identificado, não reconhece", () => {
    assert.equal(matchSubscription({ merchant: null, amount: cents(5_590) }, [netflix]), null);
  });
});
