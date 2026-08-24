import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "../../kernel/money.ts";
import { localDate } from "../../time/local-date.ts";
import { fingerprintOf } from "./fingerprint.ts";
import { type ReviewContext, buildReview, normalizeText } from "./review.ts";
import type { ImportTarget, ParseResult, ParsedRow } from "./types.ts";

const target: ImportTarget = { kind: "account", accountId: "acc-corrente" };

function row(description: string, amount: number, overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    externalId: null,
    date: localDate("2026-08-13"),
    description,
    amount: cents(amount),
    rawText: description,
    installment: null,
    ...overrides,
  };
}

function parsed(...rows: ParsedRow[]): ParseResult {
  return { format: "csv", rows, discarded: [] };
}

function contextWith(overrides: Partial<ReviewContext> = {}): ReviewContext {
  return {
    target,
    knownFingerprints: new Set<string>(),
    categoryRules: [],
    accounts: [],
    ...overrides,
  };
}

describe("normalizeText", () => {
  it("ignora caixa, acento e espaço repetido", () => {
    assert.equal(normalizeText("  SUPERMERCADO   SÃO  JOÃO "), "supermercado sao joao");
  });

  it("preserva o texto quando já está normalizado", () => {
    assert.equal(normalizeText("uber trip"), "uber trip");
  });
});

describe("montagem da revisão", () => {
  it("devolve lista vazia quando o arquivo não tem linhas", () => {
    assert.deepEqual(buildReview(parsed(), contextWith()), []);
  });

  it("infere o tipo pelo sinal do valor", () => {
    const items = buildReview(parsed(row("padaria", -1250), row("salario", 500000)), contextWith());

    assert.deepEqual(
      items.map((item) => item.kind),
      ["expense", "income"],
    );
    // O valor segue com sinal: converter para o modelo do Fluxo é trabalho de
    // quem persiste, não da revisão.
    assert.equal(items[0].row.amount, -1250);
  });

  it("nasce sempre pendente e com impressão digital calculada", () => {
    const line = row("padaria do bairro", -1250);
    const [item] = buildReview(parsed(line), contextWith());

    assert.equal(item.decision, "pendente");
    assert.equal(item.fingerprint, fingerprintOf(line, target));
  });

  it("marca sem_categoria quando nenhuma regra casa", () => {
    const items = buildReview(
      parsed(row("estabelecimento desconhecido", -3000)),
      contextWith({ categoryRules: [{ match: "posto ipiranga", categoryId: "cat-combustivel" }] }),
    );

    assert.equal(items[0].verdict, "sem_categoria");
    assert.equal(items[0].suggestedCategoryId, null);
  });

  it("casa a regra ignorando acento e caixa dos dois lados", () => {
    const items = buildReview(
      parsed(row("PADARIA  SÃO   JOÃO LTDA", -1250)),
      contextWith({ categoryRules: [{ match: "Padaria São João", categoryId: "cat-mercado" }] }),
    );

    assert.equal(items[0].suggestedCategoryId, "cat-mercado");
    assert.equal(items[0].verdict, "novo");
  });

  it("prefere a regra mais longa quando várias casam", () => {
    const items = buildReview(
      parsed(row("MERCADO LIVRE *ELETRO", -18990)),
      contextWith({
        categoryRules: [
          { match: "mercado", categoryId: "cat-mercado" },
          { match: "mercado livre", categoryId: "cat-compras" },
        ],
      }),
    );

    assert.equal(items[0].suggestedCategoryId, "cat-compras");
  });

  it("ignora regra vazia, que casaria com qualquer descrição", () => {
    const items = buildReview(
      parsed(row("padaria", -1250)),
      contextWith({ categoryRules: [{ match: "   ", categoryId: "cat-lixo" }] }),
    );

    assert.equal(items[0].suggestedCategoryId, null);
    assert.equal(items[0].verdict, "sem_categoria");
  });
});

describe("detecção de transferência", () => {
  it("reconhece pelo nome da conta e aponta o outro lado", () => {
    const items = buildReview(
      parsed(row("Envio para Conta Poupança Itaú", -50000)),
      contextWith({ accounts: [{ id: "acc-poupanca", name: "Conta Poupança Itaú" }] }),
    );

    assert.equal(items[0].verdict, "possivel_transferencia");
    assert.equal(items[0].transferCounterpartId, "acc-poupanca");
  });

  it("reconhece pelo padrão genérico, sem saber o outro lado", () => {
    const items = buildReview(
      parsed(row("TED 341 REMETENTE FULANO", -50000), row("PIX ENVIADO PARA BELTRANO", -8000)),
      contextWith({ accounts: [{ id: "acc-poupanca", name: "Conta Poupança Itaú" }] }),
    );

    for (const item of items) {
      assert.equal(item.verdict, "possivel_transferencia");
      assert.equal(item.transferCounterpartId, null);
    }
  });

  it("não confunde compra comum com transferência", () => {
    const items = buildReview(parsed(row("PADARIA CENTRAL", -1250)), contextWith());

    assert.equal(items[0].verdict, "sem_categoria");
    assert.equal(items[0].transferCounterpartId, null);
  });

  it("não casa a marca no meio de outra palavra", () => {
    const items = buildReview(
      parsed(
        row("UNITED AIRLINES 0161", -285000),
        row("AMAZON SERVICES LIMITED LTDA", -4990),
        row("DOCUMENTO CARTORIO", -9000),
      ),
      contextWith({ categoryRules: [{ match: "united airlines", categoryId: "cat-viagem" }] }),
    );

    for (const item of items) {
      assert.notEqual(item.verdict, "possivel_transferencia");
    }
    assert.equal(items[0].suggestedCategoryId, "cat-viagem");
  });

  it("reconhece a marca no fim da linha, sem espaço depois", () => {
    const items = buildReview(parsed(row("PAGAMENTO TED", -50000), row("TRANSFERENCIAS PIX", -1000)), contextWith());

    for (const item of items) {
      assert.equal(item.verdict, "possivel_transferencia");
    }
  });

  it("não propõe transferência da conta importada para ela mesma", () => {
    const items = buildReview(
      parsed(row("TARIFA MENSAL CONTA CORRENTE", -3490)),
      contextWith({ accounts: [{ id: "acc-corrente", name: "Conta Corrente" }] }),
    );

    assert.equal(items[0].transferCounterpartId, null);
    assert.equal(items[0].verdict, "sem_categoria");
  });

  it("ainda aponta o outro lado quando o nome não é o da conta importada", () => {
    const items = buildReview(
      parsed(row("TRANSFERENCIA PARA Conta Poupança", -50000)),
      contextWith({
        accounts: [
          { id: "acc-corrente", name: "Conta Corrente" },
          { id: "acc-poupanca", name: "Conta Poupança" },
        ],
      }),
    );

    assert.equal(items[0].verdict, "possivel_transferencia");
    assert.equal(items[0].transferCounterpartId, "acc-poupanca");
  });

  it("vence a categorização: transferência não é gasto", () => {
    const items = buildReview(
      parsed(row("TRANSFERENCIA MERCADO PAGO", -20000)),
      contextWith({ categoryRules: [{ match: "mercado", categoryId: "cat-mercado" }] }),
    );

    assert.equal(items[0].verdict, "possivel_transferencia");
    // A sugestão continua registrada — o veredito não apaga o que foi inferido.
    assert.equal(items[0].suggestedCategoryId, "cat-mercado");
  });
});

describe("precedência do veredito", () => {
  it("duplicado vence transferência", () => {
    const line = row("TRANSFERENCIA PARA Conta Poupança Itaú", -50000, { externalId: "FITID-1" });
    const items = buildReview(
      parsed(line),
      contextWith({
        knownFingerprints: new Set([fingerprintOf(line, target)]),
        accounts: [{ id: "acc-poupanca", name: "Conta Poupança Itaú" }],
      }),
    );

    assert.equal(items[0].verdict, "duplicado");
    // O pareamento continua visível: se o usuário aceitar a linha assim mesmo,
    // a tela já sabe qual é a conta do outro lado.
    assert.equal(items[0].transferCounterpartId, "acc-poupanca");
  });

  it("duplicado vence sem_categoria", () => {
    const line = row("ESTABELECIMENTO DESCONHECIDO", -3000, { externalId: "FITID-2" });
    const items = buildReview(
      parsed(line),
      contextWith({ knownFingerprints: new Set([fingerprintOf(line, target)]) }),
    );

    assert.equal(items[0].verdict, "duplicado");
  });

  it("linha nova e categorizada é novo", () => {
    const items = buildReview(
      parsed(row("POSTO IPIRANGA 42", -20000)),
      contextWith({
        knownFingerprints: new Set(["outra-coisa"]),
        categoryRules: [{ match: "posto ipiranga", categoryId: "cat-combustivel" }],
      }),
    );

    assert.equal(items[0].verdict, "novo");
    assert.equal(items[0].suggestedCategoryId, "cat-combustivel");
  });
});
