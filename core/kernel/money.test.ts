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
  negate,
  parseMoney,
  parseScaled,
  percentOf,
  sum,
  toDecimal,
} from "./money.ts";

/**
 * O ICU separa "R$" do numero com espaco nao-quebravel (U+00A0) e usa U+202F
 * em alguns locales. Comparar com espaco comum falharia por um caractere
 * invisivel, entao normalizamos por codigo.
 */
function semEspacoEstranho(texto: string): string {
  return texto.replace(/[  ]/g, " ");
}

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
      // Mais de um grupo de milhar: o separador repetido não pode ser decimal.
      ["1.500.000", 150000000],
      ["12.345.678", 1234567800],
      ["R$ 2.350.000", 235000000],
      // Parte inteira "0" denuncia fração, não milhar.
      ["0,005", 1],
      ["0,999", 100],
      ["0.005", 1],
      // Parte inteira longa demais para ser um grupo de milhar.
      ["12345.678", 1234568],
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

  /**
   * A mesma leitura, em outra unidade.
   *
   * Pontos de cartão e horas são guardados em milésimos, e quem precisava ler
   * "2500,61" nessa unidade acabava pedindo um inteiro — o resgate de um saldo
   * com casas voltava como "informe um número inteiro". O que estes casos
   * fixam é que a parte difícil (qual separador é decimal) continua sendo a
   * mesma do dinheiro, e que só a escala muda.
   */
  describe("parseScaled", () => {
    const casos: Array<[string, number, number | null]> = [
      ["2500,61", 3, 2_500_610],
      ["2500.61", 3, 2_500_610],
      ["2.500,61", 3, 2_500_610],
      ["11257", 3, 11_257_000],
      ["1,5", 3, 1500],
      // Três casas é o que a unidade guarda; a quarta arredonda, não some.
      ["0,0005", 3, 1],
      ["1.500", 3, 1_500_000],
      ["abc", 3, null],
      ["", 3, null],
      // Escala 0 é contagem pura: a fração arredonda para a unidade.
      ["7,4", 0, 7],
      ["7,6", 0, 8],
      ["1.234,56", 2, 123_456],
    ];

    for (const [entrada, escala, esperado] of casos) {
      it(`interpreta ${JSON.stringify(entrada)} na escala ${escala}`, () => {
        assert.equal(parseScaled(entrada, escala), esperado);
      });
    }

    it("concorda com parseMoney na escala do dinheiro", () => {
      for (const [entrada] of casos) {
        assert.equal(parseScaled(entrada, 2), parseMoney(entrada), entrada);
      }
    });
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

  it("nunca produz zero negativo", () => {
    // `-0` some em toda comparação mas o Intl o formata como "-R$ 0,00".
    assert.ok(!Object.is(multiply(cents(-20), 0.01), -0));
    assert.ok(!Object.is(negate(cents(0)), -0));
    assert.ok(!Object.is(percentOf(cents(-20), 1), -0));
    assert.equal(semEspacoEstranho(format(percentOf(cents(-20), 1))), "R$ 0,00");
    assert.ok(allocate(cents(-1), 3).every((parte) => !Object.is(parte, -0)));
  });

  it("formata em reais", () => {
    assert.equal(semEspacoEstranho(format(cents(123456))), "R$ 1.234,56");
    assert.equal(semEspacoEstranho(format(cents(-500))), "-R$ 5,00");
  });
});
