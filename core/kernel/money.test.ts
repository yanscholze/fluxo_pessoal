import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MoneyError,
  add,
  allocate,
  allocateByWeights,
  cents,
  format,
  fromDecimal,
  multiply,
  parseMoney,
  percentOf,
  sum,
  toDecimal,
} from "./money.ts";

describe("money", () => {
  it("constrói a partir de decimais sem erro de ponto flutuante", () => {
    assert.equal(fromDecimal(0.1) + fromDecimal(0.2), fromDecimal(0.3));
    assert.equal(fromDecimal(12.34), 1234);
    assert.equal(fromDecimal(-0.01), -1);
  });

  it("recusa valores não representáveis", () => {
    assert.throws(() => cents(Number.NaN), MoneyError);
    assert.throws(() => fromDecimal(Number.POSITIVE_INFINITY), MoneyError);
  });

  it("soma sem acumular erro", () => {
    const parcels = Array.from({ length: 100 }, () => fromDecimal(0.07));
    assert.equal(sum(parcels), fromDecimal(7));
    assert.equal(toDecimal(add(fromDecimal(1.1), fromDecimal(2.2))), 3.3);
  });

  describe("parseMoney", () => {
    const casos: Array<[string, number | null]> = [
      ["1.234,56", 123456],
      ["R$ 1.234,56", 123456],
      ["1234,56", 123456],
      ["1234.56", 123456],
      ["1,234.56", 123456],
      ["1.234.567,89", 123456789],
      ["12,5", 1250],
      ["1.234", 123400],
      ["100", 10000],
      ["-12,50", -1250],
      ["(12,50)", -1250],
      ["", null],
      ["abc", null],
      ["R$", null],
    ];

    for (const [entrada, esperado] of casos) {
      it(`interpreta ${JSON.stringify(entrada)}`, () => {
        assert.equal(parseMoney(entrada), esperado);
      });
    }
  });

  describe("allocate", () => {
    it("distribui o resto sem perder centavos", () => {
      assert.deepEqual(allocate(cents(10000), 3), [3334, 3333, 3333]);
      assert.deepEqual(allocate(cents(1000), 3), [334, 333, 333]);
      assert.deepEqual(allocate(cents(100), 4), [25, 25, 25, 25]);
    });

    it("mantém a soma exatamente igual ao total em qualquer divisão", () => {
      for (let total = 1; total <= 400; total += 7) {
        for (let parts = 1; parts <= 48; parts += 1) {
          const fatias = allocate(cents(total), parts);
          assert.equal(sum(fatias), total, `${total} em ${parts}x`);
          assert.equal(fatias.length, parts);
        }
      }
    });

    it("preserva o sinal em valores negativos", () => {
      assert.deepEqual(allocate(cents(-10000), 3), [-3334, -3333, -3333]);
    });

    it("recusa quantidade inválida de parcelas", () => {
      assert.throws(() => allocate(cents(100), 0), MoneyError);
      assert.throws(() => allocate(cents(100), 1.5), MoneyError);
    });
  });

  describe("allocateByWeights", () => {
    it("rateia proporcionalmente sem perder centavos", () => {
      const fatias = allocateByWeights(cents(10000), [1, 1, 2]);
      assert.equal(sum(fatias), 10000);
      assert.deepEqual(fatias, [2500, 2500, 5000]);
    });

    it("entrega o resto a quem tem a maior fração", () => {
      const fatias = allocateByWeights(cents(1000), [1, 1, 1]);
      assert.equal(sum(fatias), 1000);
    });

    it("cai na divisão igual quando todos os pesos são zero", () => {
      assert.deepEqual(allocateByWeights(cents(300), [0, 0, 0]), [100, 100, 100]);
    });
  });

  describe("multiply e percentOf", () => {
    it("arredonda simetricamente em torno do zero", () => {
      assert.equal(multiply(cents(101), 0.5), 51);
      assert.equal(multiply(cents(-101), 0.5), -51);
    });

    it("aplica percentual de cashback", () => {
      assert.equal(percentOf(cents(10000), 1.5), 150);
      assert.equal(percentOf(cents(12345), 2), 247);
    });
  });

  it("formata em reais", () => {
    // O separador de milhar do ICU é U+00A0 em pt-BR; comparamos normalizando.
    const texto = format(cents(123456)).replace(/ /g, " ");
    assert.equal(texto, "R$ 1.234,56");
    assert.equal(format(cents(-500)).replace(/ /g, " "), "-R$ 5,00");
  });
});
