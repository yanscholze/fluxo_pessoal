import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { guessCategory } from "./categorize.ts";

describe("classificação de categoria por estabelecimento", () => {
  it("reconhece marcas conhecidas", () => {
    assert.equal(guessCategory("IFOOD *RESTAURANTE")?.label, "Alimentação");
    assert.equal(guessCategory("UBER *TRIP")?.label, "Transporte");
    assert.equal(guessCategory("NETFLIX.COM")?.label, "Assinaturas");
    assert.equal(guessCategory("DROGARIA SAO PAULO")?.label, "Saúde");
    assert.equal(guessCategory("AMAZON BR")?.label, "Compras");
    assert.equal(guessCategory("ENEL DISTRIBUICAO")?.label, "Moradia");
    assert.equal(guessCategory("CINEMARK SHOPPING")?.label, "Lazer");
  });

  it("ignora acento e caixa", () => {
    assert.equal(guessCategory("Pão de Açúcar")?.label, "Alimentação");
    assert.equal(guessCategory("PAO DE ACUCAR")?.label, "Alimentação");
    assert.equal(guessCategory("farmácia pague menos")?.label, "Saúde");
  });

  it("marca vence genérico quando os dois casariam", () => {
    // "mercado" sozinho é alimentação, mas Mercado Livre é compra — e a regra
    // da marca vem antes justamente por isso.
    assert.equal(guessCategory("MERCADO LIVRE")?.label, "Compras");
    assert.equal(guessCategory("MERCADOLIVRE*COMPRA")?.label, "Compras");
    assert.equal(guessCategory("SUPERMERCADO ANGELONI")?.label, "Alimentação");
  });

  it("cai para o texto bruto quando o estabelecimento não foi isolado", () => {
    const palpite = guessCategory(null, "Compra aprovada de R$ 55,90 no NETFLIX");
    assert.equal(palpite?.label, "Assinaturas");
  });

  it("confia menos quando o casamento veio do texto e não do estabelecimento", () => {
    const noNome = guessCategory("NETFLIX", "");
    const noTexto = guessCategory(null, "Compra no NETFLIX aprovada");

    assert.ok(noNome && noTexto);
    // O texto completo traz palavras do banco que não descrevem a compra; um
    // acerto ali vale menos do que um acerto no nome da loja.
    assert.ok(noTexto.confidence < noNome.confidence);
  });

  it("devolve nulo quando nada casa, em vez de chutar", () => {
    // Chutar "Outros" faria o usuário confirmar sem perceber, e o relatório
    // por categoria encheria de lixo.
    assert.equal(guessCategory("PAG*JOAODASILVA"), null);
    assert.equal(guessCategory(null, ""), null);
    assert.equal(guessCategory("", "   "), null);
  });

  it("informa qual termo casou, para a tela poder explicar o palpite", () => {
    const palpite = guessCategory("POSTO IPIRANGA CENTRO");
    assert.equal(palpite?.label, "Transporte");
    assert.ok(palpite && ["posto", "ipiranga"].includes(palpite.matched));
  });
});
