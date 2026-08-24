import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cents } from "../../kernel/money.ts";
import { competence } from "../../time/competence.ts";
import { localDate } from "../../time/local-date.ts";
import { duplicateCandidates, fingerprintOf, isDuplicate } from "./fingerprint.ts";
import type { ImportTarget, ParsedRow } from "./types.ts";

const conta: ImportTarget = { kind: "account", accountId: "acc-1" };
const outraConta: ImportTarget = { kind: "account", accountId: "acc-2" };
const faturaAgosto: ImportTarget = { kind: "card", cardId: "card-1", competence: competence("2026-08") };
const faturaSetembro: ImportTarget = { kind: "card", cardId: "card-1", competence: competence("2026-09") };
const outroCartao: ImportTarget = { kind: "card", cardId: "card-2", competence: competence("2026-08") };

function row(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    externalId: null,
    date: localDate("2026-08-13"),
    description: "Mercado São Paulo",
    amount: cents(-15990),
    rawText: "linha original",
    installment: null,
    ...overrides,
  };
}

describe("identidade por FITID", () => {
  it("não muda com a competência da fatura", () => {
    const linha = row({ externalId: "202608130001" });

    assert.equal(fingerprintOf(linha, faturaAgosto), fingerprintOf(linha, faturaSetembro));
  });

  it("ignora data, descrição e valor — o emissor já garante a unicidade", () => {
    const original = row({ externalId: "FIT-1" });
    const remendada = row({
      externalId: "FIT-1",
      date: localDate("2026-08-14"),
      description: "MERCADO SAO PAULO LTDA",
      amount: cents(-16000),
    });

    assert.equal(fingerprintOf(original, conta), fingerprintOf(remendada, conta));
  });

  it("separa FITIDs diferentes", () => {
    assert.notEqual(fingerprintOf(row({ externalId: "FIT-1" }), conta), fingerprintOf(row({ externalId: "FIT-2" }), conta));
  });

  it("trata FITID vazio como ausente e cai na identidade composta", () => {
    assert.equal(fingerprintOf(row({ externalId: "   " }), conta), fingerprintOf(row(), conta));
  });
});

describe("identidade composta", () => {
  it("colide entre grafias diferentes da mesma descrição", () => {
    const doOfx = row({ description: "Mercado  São  Paulo" });
    const doCsv = row({ description: "mercado sao paulo" });

    assert.equal(fingerprintOf(doOfx, conta), fingerprintOf(doCsv, conta));
  });

  it("ignora pontuação de borda, mas não a do meio", () => {
    assert.equal(fingerprintOf(row({ description: "*Mercado São Paulo - " }), conta), fingerprintOf(row(), conta));
    assert.notEqual(fingerprintOf(row({ description: "Mercado-São-Paulo" }), conta), fingerprintOf(row(), conta));
  });

  it("separa competências diferentes do mesmo cartão", () => {
    // Assinatura mensal de valor fixo: data e descrição se repetem, e só a
    // fatura distingue uma cobrança da outra.
    assert.notEqual(fingerprintOf(row(), faturaAgosto), fingerprintOf(row(), faturaSetembro));
  });

  it("separa parcelas diferentes da mesma compra", () => {
    const terceira = row({ installment: { current: 3, total: 10 } });
    const quarta = row({ installment: { current: 4, total: 10 } });

    assert.notEqual(fingerprintOf(terceira, faturaAgosto), fingerprintOf(quarta, faturaAgosto));
  });

  it("separa linha parcelada de linha à vista", () => {
    assert.notEqual(fingerprintOf(row({ installment: { current: 1, total: 1 } }), conta), fingerprintOf(row(), conta));
  });

  it("não deixa a descrição forjar campos do fingerprint", () => {
    // A barra é o separador: se sobrevivesse na descrição, uma linha poderia
    // deslocar os campos e assumir a identidade de outra.
    const comBarra = row({ description: "acc-2|2026-01-01|outra coisa" });

    assert.equal(
      fingerprintOf(comBarra, conta).split("|").length,
      fingerprintOf(row(), conta).split("|").length,
      "o número de campos não muda",
    );
    assert.notEqual(fingerprintOf(comBarra, conta), fingerprintOf(row({ description: "outra coisa" }), outraConta));
  });
});

describe("alvos diferentes nunca colidem", () => {
  it("entre contas", () => {
    assert.notEqual(fingerprintOf(row(), conta), fingerprintOf(row(), outraConta));
    assert.notEqual(fingerprintOf(row({ externalId: "FIT-1" }), conta), fingerprintOf(row({ externalId: "FIT-1" }), outraConta));
  });

  it("entre cartões", () => {
    assert.notEqual(fingerprintOf(row(), faturaAgosto), fingerprintOf(row(), outroCartao));
  });

  it("entre conta e cartão de mesmo identificador", () => {
    const mesmoId: ImportTarget = { kind: "card", cardId: "acc-1", competence: competence("2026-08") };
    const linha = row({ externalId: "FIT-1" });

    assert.notEqual(fingerprintOf(linha, conta), fingerprintOf(linha, mesmoId));
  });
});

describe("tolerância de arredondamento", () => {
  const conhecidos = (linha: ParsedRow, alvo: ImportTarget): ReadonlySet<string> =>
    new Set([fingerprintOf(linha, alvo)]);

  it("um centavo de diferença é outra compra quando não é parcela", () => {
    const gravada = row();
    const nova = row({ amount: cents(-15991) });

    assert.equal(isDuplicate(nova, conta, conhecidos(gravada, conta)), false);
    assert.deepEqual(duplicateCandidates(nova, conta), [fingerprintOf(nova, conta)]);
  });

  it("um centavo de diferença é a mesma parcela", () => {
    const parcela = { current: 3, total: 10 } as const;
    const gravada = row({ installment: parcela });
    const nova = row({ amount: cents(-15991), installment: parcela });

    assert.equal(isDuplicate(nova, faturaAgosto, conhecidos(gravada, faturaAgosto)), true);
  });

  it("cobre até cinco centavos para cada lado, e para aí", () => {
    const parcela = { current: 3, total: 10 } as const;
    const gravada = row({ installment: parcela });
    const conhecido = conhecidos(gravada, faturaAgosto);

    for (const delta of [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]) {
      const nova = row({ amount: cents(-15990 + delta), installment: parcela });
      assert.equal(isDuplicate(nova, faturaAgosto, conhecido), true, `delta ${delta}`);
    }

    for (const delta of [-6, 6, 100]) {
      const nova = row({ amount: cents(-15990 + delta), installment: parcela });
      assert.equal(isDuplicate(nova, faturaAgosto, conhecido), false, `delta ${delta}`);
    }
  });

  it("a tolerância não atravessa parcelas nem competências", () => {
    const gravada = row({ installment: { current: 3, total: 10 } });
    const conhecido = conhecidos(gravada, faturaAgosto);

    const outraParcela = row({ amount: cents(-15991), installment: { current: 4, total: 10 } });
    assert.equal(isDuplicate(outraParcela, faturaAgosto, conhecido), false);

    const mesmaParcelaOutraFatura = row({ amount: cents(-15991), installment: { current: 3, total: 10 } });
    assert.equal(isDuplicate(mesmaParcelaOutraFatura, faturaSetembro, conhecido), false);
  });

  it("parcela com FITID mantém o FITID à frente e a composta como alternativa", () => {
    const linha = row({ externalId: "FIT-9", installment: { current: 2, total: 6 } });
    const candidatos = duplicateCandidates(linha, faturaAgosto);

    assert.equal(candidatos[0], fingerprintOf(linha, faturaAgosto));
    assert.equal(candidatos.length, 12, "FITID + composta + 10 variantes");
    assert.equal(new Set(candidatos).size, candidatos.length, "sem candidato repetido");

    // Mesma parcela gravada antes por um CSV, sem FITID: precisa ser encontrada.
    const doCsv = row({ installment: { current: 2, total: 6 } });
    assert.equal(isDuplicate(linha, faturaAgosto, conhecidos(doCsv, faturaAgosto)), true);
  });

  it("linha sem parcela tem candidato único", () => {
    assert.deepEqual(duplicateCandidates(row(), conta), [fingerprintOf(row(), conta)]);
    const comFitid = row({ externalId: "FIT-1" });
    assert.deepEqual(duplicateCandidates(comFitid, conta), [fingerprintOf(comFitid, conta)]);
  });
});

describe("determinismo", () => {
  it("mesma entrada, mesma saída", () => {
    const linha = row({ installment: { current: 3, total: 10 } });

    assert.equal(fingerprintOf(linha, faturaAgosto), fingerprintOf(linha, faturaAgosto));
    assert.deepEqual(duplicateCandidates(linha, faturaAgosto), duplicateCandidates(linha, faturaAgosto));
  });

  it("não depende de campos que só servem para exibição", () => {
    // `rawText` muda entre formatos do mesmo lançamento; entrar na identidade
    // faria o mesmo gasto duplicar ao importar CSV depois de OFX.
    assert.equal(fingerprintOf(row({ rawText: "outro trecho" }), conta), fingerprintOf(row(), conta));
  });

  it("é uma string estável e legível", () => {
    assert.equal(
      fingerprintOf(row({ installment: { current: 3, total: 10 } }), faturaAgosto),
      "card|card-1|2026-08|2026-08-13|mercado sao paulo|-15990|3/10",
    );
    assert.equal(fingerprintOf(row({ externalId: "FIT-1" }), faturaAgosto), "card|card-1|fitid|FIT-1");
  });

  it("isDuplicate é falso contra um conjunto vazio", () => {
    assert.equal(isDuplicate(row(), conta, new Set()), false);
  });
});
