import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "../../kernel/money.ts";
import { competence } from "../../time/competence.ts";
import { localDate } from "../../time/local-date.ts";
import { type ReconcileConfig, type StatementSource, assertComplete, reconcile } from "./reconcile.ts";
import type { DiscardedRow, ParseResult, ParsedRow } from "./types.ts";

const CONTA = "acc-corrente";
const CARTAO = "card-nubank";
const CAIXINHA = "acc-caixinha";
const EXTERNA = "acc-mercado-pago";

const config: ReconcileConfig = {
  accountId: CONTA,
  cardId: CARTAO,
  investmentAccountId: CAIXINHA,
  ownExternalAccounts: [{ match: "Yan Augusto Scholze", accountId: EXTERNA }],
};

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

function conta(rows: ParsedRow[], balance?: { amount: number; asOf: string }): StatementSource {
  const parsed: ParseResult = {
    format: "ofx",
    rows,
    discarded: [],
    ...(balance ? { balance: { amount: cents(balance.amount), asOf: localDate(balance.asOf) } } : {}),
  };
  return { label: "extrato.ofx", target: { kind: "account", accountId: CONTA }, parsed };
}

function cartao(
  rows: ParsedRow[],
  options: { competence?: string; discarded?: DiscardedRow[]; balance?: { amount: number; asOf: string }; label?: string } = {},
): StatementSource {
  const parsed: ParseResult = {
    format: "ofx",
    rows,
    discarded: options.discarded ?? [],
    ...(options.balance
      ? { balance: { amount: cents(options.balance.amount), asOf: localDate(options.balance.asOf) } }
      : {}),
  };
  return {
    label: options.label ?? "fatura.ofx",
    target: { kind: "card", cardId: CARTAO, competence: competence(options.competence ?? "2026-08") },
    parsed,
  };
}

/** O parser entrega pagamento de fatura e estorno como descarte com a linha. */
function descarte(reason: DiscardedRow["reason"], parsedRow: ParsedRow): DiscardedRow {
  return { reason, rawText: parsedRow.rawText, row: parsedRow };
}

describe("pagamento de fatura", () => {
  const debito = row("Pagamento de fatura", -119490, { externalId: "FIT-PAG", date: localDate("2026-08-10") });
  const credito = row("Pagamento recebido", 119490, { externalId: "FIT-PAG", date: localDate("2026-08-10") });

  it("junta os dois lados num lançamento só", () => {
    const resultado = reconcile(
      [conta([debito]), cartao([], { discarded: [descarte("pagamento_de_fatura", credito)] })],
      config,
    );

    assert.equal(resultado.entries.length, 1);
    const [pagamento] = resultado.entries;
    assert.equal(pagamento.kind, "invoice_payment");
    assert.equal(pagamento.amount, cents(119490));
    assert.deepEqual(pagamento.origin, { kind: "account", id: CONTA });
    assert.deepEqual(pagamento.destination, { kind: "card", id: CARTAO });
  });

  it("não deixa o débito da conta virar despesa", () => {
    // É este o erro que dobra o gasto: as compras da fatura já entraram como
    // despesa, e o pagamento entraria de novo.
    const resultado = reconcile(
      [conta([debito]), cartao([], { discarded: [descarte("pagamento_de_fatura", credito)] })],
      config,
    );

    assert.equal(resultado.entries.some((entry) => entry.kind === "expense"), false);
  });

  it("acusa o débito sem par em vez de escondê-lo", () => {
    const resultado = reconcile([conta([debito])], config);

    assert.equal(resultado.entries.length, 0);
    assert.equal(resultado.unmatched.length, 1);
    assert.equal(resultado.unmatched[0].row.description, "Pagamento de fatura");
  });

  it("não casa valores diferentes sob o mesmo FITID", () => {
    const outroValor = row("Pagamento recebido", 50000, { externalId: "FIT-PAG" });
    const resultado = reconcile(
      [conta([debito]), cartao([], { discarded: [descarte("pagamento_de_fatura", outroValor)] })],
      config,
    );

    assert.equal(resultado.unmatched.length, 1);
  });
});

describe("caixinha", () => {
  it("aplicação vira transferência para o investimento, não despesa", () => {
    const resultado = reconcile([conta([row("Aplicação RDB", -30000)])], config);

    assert.equal(resultado.entries.length, 1);
    const [transferencia] = resultado.entries;
    assert.equal(transferencia.kind, "transfer");
    assert.deepEqual(transferencia.origin, { kind: "account", id: CONTA });
    assert.deepEqual(transferencia.destination, { kind: "account", id: CAIXINHA });
  });

  it("resgate vira transferência de volta, não receita", () => {
    const resultado = reconcile([conta([row("Resgate RDB", 40000)])], config);

    const [transferencia] = resultado.entries;
    assert.equal(transferencia.kind, "transfer");
    assert.deepEqual(transferencia.origin, { kind: "account", id: CAIXINHA });
    assert.deepEqual(transferencia.destination, { kind: "account", id: CONTA });
  });

  it("aplicação e resgate não inflam gasto nem renda", () => {
    const resultado = reconcile([conta([row("Aplicação RDB", -30000), row("Resgate RDB", 40000)])], config);

    assert.equal(resultado.entries.every((entry) => entry.kind === "transfer"), true);
  });

  it("aplicação devolvida no mesmo dia se anula por completo", () => {
    const saida = row("Aplicação em investimento", -9513, { externalId: "FIT-APP" });
    const volta = row("Devolução - Aplicação em investimento", 9513, { externalId: "FIT-APP" });
    const resultado = reconcile([conta([saida, volta])], config);

    assert.equal(resultado.entries.length, 0);
    assert.equal(resultado.cancelled.length, 1);
    assert.equal(resultado.cancelled[0].reason, "aplicacao_devolvida");
  });

  it("não confunde um Pix cujo texto contenha 'resgate' com movimento da caixinha", () => {
    const resultado = reconcile([conta([row("Transferência enviada pelo Pix - RESGATE MOTOS LTDA", -5000)])], config);

    assert.equal(resultado.entries[0].kind, "expense");
  });
});

describe("estorno de Pix na conta", () => {
  it("anula o débito original pelo FITID com sufixo", () => {
    const enviado = row("Transferência enviada pelo Pix", -20000, { externalId: "FIT-PIX" });
    const estorno = row("Estorno - Transferência enviada pelo Pix", 20000, { externalId: "FIT-PIX:reversal" });
    const resultado = reconcile([conta([enviado, estorno])], config);

    assert.equal(resultado.entries.length, 0);
    assert.equal(resultado.cancelled[0].reason, "pix_estornado");
  });

  it("acusa o estorno cujo original não veio no arquivo", () => {
    const estorno = row("Estorno - Transferência enviada pelo Pix", 20000, { externalId: "FIT-AUSENTE:reversal" });
    const resultado = reconcile([conta([estorno])], config);

    assert.equal(resultado.unmatched.length, 1);
    assert.match(resultado.unmatched[0].expected, /FIT-AUSENTE/);
  });
});

describe("estorno no cartão", () => {
  it("anula a compra quando o valor bate exatamente", () => {
    const compra = row("Shopee", -4845, { externalId: "FIT-1" });
    const estorno = row('Estorno de "Shopee"', 4845, { externalId: "FIT-1" });
    const resultado = reconcile([cartao([compra], { discarded: [descarte("estorno", estorno)] })], config);

    assert.equal(resultado.entries.length, 0);
    assert.equal(resultado.cancelled[0].reason, "estorno_total");
  });

  it("estorno parcial deixa a diferença como estorno na fatura em que caiu", () => {
    // O crédito não pode abater a fatura anterior: ela já foi paga pelo valor
    // cheio, e mexer nela faria o pagamento virar sobra.
    const compra = row("Valcinei", -10002, { externalId: "FIT-2" });
    const estorno = row('Estorno de "Valcinei"', 9586, { externalId: "FIT-2" });
    const resultado = reconcile([cartao([compra], { discarded: [descarte("estorno", estorno)] })], config);

    const kinds = resultado.entries.map((entry) => entry.kind).sort();
    assert.deepEqual(kinds, ["expense", "refund"]);
    const refund = resultado.entries.find((entry) => entry.kind === "refund");
    assert.equal(refund?.amount, cents(9586));
    assert.deepEqual(refund?.origin, { kind: "card", id: CARTAO });
  });

  it("não anula contra uma compra de outra fatura", () => {
    const compra = row("Valcinei", -10004, { externalId: "FIT-3", date: localDate("2026-08-01") });
    const estorno = row('Estorno de "Valcinei"', 10004, { externalId: "FIT-3", date: localDate("2026-08-20") });
    const resultado = reconcile(
      [
        cartao([compra], { competence: "2026-08", label: "fatura-08.ofx" }),
        cartao([], { competence: "2026-09", label: "fatura-09.ofx", discarded: [descarte("estorno", estorno)] }),
      ],
      config,
    );

    assert.equal(resultado.cancelled.length, 0);
    const agosto = resultado.entries.find((entry) => entry.source === "fatura-08.ofx");
    const setembro = resultado.entries.find((entry) => entry.source === "fatura-09.ofx");
    assert.equal(agosto?.kind, "expense", "a fatura de agosto mantém a compra cheia");
    assert.equal(setembro?.kind, "refund", "o crédito abate setembro, que é onde ele caiu");
  });

  it("IOF devolvido anula o IOF cobrado, que não compartilha FITID", () => {
    const cobrado = row("IOF de compra internacional", -397, { externalId: "FIT-A" });
    const devolvido = row("IOF de volta de Anthropic", 397, { externalId: "FIT-B" });
    const resultado = reconcile([cartao([cobrado], { discarded: [descarte("estorno", devolvido)] })], config);

    assert.equal(resultado.cancelled[0].reason, "iof_devolvido");
  });
});

describe("transferência com conta própria em outro banco", () => {
  it("entrada vira transferência de lá para cá, não receita", () => {
    const resultado = reconcile([conta([row("Transferência recebida pelo Pix - Yan Augusto Scholze", 19589)])], config);

    const [entrada] = resultado.entries;
    assert.equal(entrada.kind, "transfer");
    assert.deepEqual(entrada.origin, { kind: "account", id: EXTERNA });
    assert.deepEqual(entrada.destination, { kind: "account", id: CONTA });
  });

  it("saída vira transferência daqui para lá, não despesa", () => {
    const resultado = reconcile([conta([row("Transferência enviada pelo Pix - Yan Augusto Scholze", -10000)])], config);

    const [saida] = resultado.entries;
    assert.equal(saida.kind, "transfer");
    assert.deepEqual(saida.origin, { kind: "account", id: CONTA });
    assert.deepEqual(saida.destination, { kind: "account", id: EXTERNA });
  });

  it("Pix para terceiro continua sendo despesa", () => {
    const resultado = reconcile([conta([row("Transferência enviada pelo Pix - Luis Gabriel Beckert", -3625)])], config);

    assert.equal(resultado.entries[0].kind, "expense");
  });
});

describe("parcelas", () => {
  it("mantém cada parcela como lançamento próprio mesmo compartilhando FITID", () => {
    const segunda = row("Samsung", -15509, { externalId: "FIT-S", installment: { current: 2, total: 12 } });
    const terceira = row("Samsung", -15509, { externalId: "FIT-S", installment: { current: 3, total: 12 } });
    const resultado = reconcile(
      [
        cartao([segunda], { competence: "2026-08", label: "f8.ofx" }),
        cartao([terceira], { competence: "2026-09", label: "f9.ofx" }),
      ],
      config,
    );

    assert.equal(resultado.entries.length, 2);
    assert.notEqual(resultado.entries[0].fingerprintSeed, resultado.entries[1].fingerprintSeed);
    assert.deepEqual(resultado.entries[0].installment, { current: 2, total: 12 });
  });
});

describe("completude", () => {
  it("toda linha termina em lançamento, par anulado ou pendência", () => {
    const debito = row("Pagamento de fatura", -119490, { externalId: "FIT-PAG" });
    const credito = row("Pagamento recebido", 119490, { externalId: "FIT-PAG" });
    const compra = row("Shopee", -4845, { externalId: "FIT-1" });
    const estorno = row('Estorno de "Shopee"', 4845, { externalId: "FIT-1" });

    const sources = [
      conta([debito, row("Aplicação RDB", -30000), row("Compra no débito - Mercado", -5000)]),
      cartao([compra], {
        discarded: [descarte("pagamento_de_fatura", credito), descarte("estorno", estorno)],
      }),
    ];
    const resultado = reconcile(sources, config);

    assert.doesNotThrow(() => assertComplete(sources, resultado));
  });
});

describe("conferência de saldo", () => {
  it("fecha a conta quando o saldo de abertura é informado", () => {
    const sources = [
      conta([row("Compra no débito - Mercado", -5000, { date: localDate("2026-08-05") })], {
        amount: 26684,
        asOf: "2026-08-31",
      }),
    ];
    const resultado = reconcile(sources, { ...config, openingAccountBalance: cents(31684) });

    assert.equal(resultado.balances[0].matches, true);
  });

  it("acusa a diferença quando a abertura é omitida", () => {
    const sources = [
      conta([row("Compra no débito - Mercado", -5000, { date: localDate("2026-08-05") })], {
        amount: 26684,
        asOf: "2026-08-31",
      }),
    ];
    const resultado = reconcile(sources, config);

    assert.equal(resultado.balances[0].matches, false);
    assert.equal(resultado.balances[0].declared - resultado.balances[0].reconciled, 31684);
  });

  it("soma o cartão por competência, porque a fatura não é um mês de calendário", () => {
    // A compra do dia 13 cai na fatura seguinte. Conferir por data juntaria as
    // duas faturas e acusaria divergência onde não há.
    const sources = [
      cartao([row("Compra", -10000, { date: localDate("2026-08-01") })], {
        competence: "2026-08",
        label: "f8.ofx",
        balance: { amount: -10000, asOf: "2026-08-13" },
      }),
      cartao([row("Compra", -5000, { date: localDate("2026-08-13") })], {
        competence: "2026-09",
        label: "f9.ofx",
        balance: { amount: -15000, asOf: "2026-09-13" },
      }),
    ];
    const resultado = reconcile(sources, config);

    assert.equal(resultado.balances.every((balance) => balance.matches), true);
  });
});
