import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { contrastRatio, luminance, needsDarkInk, readableInk } from "./color.ts";

describe("tinta legível", () => {
  it("a paleta de partida dos cartões escolhe a tinta certa em cada cor", () => {
    // Metade dela reprovava com branco fixo. O âmbar é o caso extremo: 2,15:1
    // com branco, 8,53:1 com a tinta escura.
    const esperado: Record<string, string> = {
      "#7c5cff": "#ffffff", // roxo
      "#0d9668": "#10151c", // verde
      "#2563eb": "#ffffff", // azul
      "#dc2626": "#ffffff", // vermelho
      "#f59e0b": "#10151c", // âmbar
      "#0891b2": "#10151c", // ciano
      "#db2777": "#ffffff", // rosa
      "#1f2937": "#ffffff", // grafite
    };

    for (const [fundo, tinta] of Object.entries(esperado)) {
      assert.equal(readableInk(fundo), tinta, fundo);
    }
  });

  it("a tinta escolhida é sempre a de maior contraste", () => {
    for (const fundo of ["#000000", "#ffffff", "#808080", "#f59e0b", "#123456", "#abcdef"]) {
      const escolhida = readableInk(fundo);
      const outra = escolhida === "#ffffff" ? "#10151c" : "#ffffff";
      assert.ok(
        contrastRatio(escolhida, fundo) >= contrastRatio(outra, fundo),
        `${fundo}: escolheu ${escolhida}`,
      );
    }
  });

  it("os extremos batem com a definição da WCAG", () => {
    assert.equal(luminance("#000000"), 0);
    assert.equal(luminance("#ffffff"), 1);
    assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
    assert.equal(contrastRatio("#123456", "#123456"), 1);
  });

  it("aceita as formas que um seletor de cor produz", () => {
    // `#fff`, `fff`, `#FFFFFF` e com espaço sobrando são o mesmo branco.
    for (const branco of ["#fff", "fff", "#FFFFFF", " #ffffff "]) {
      assert.equal(luminance(branco), 1, branco);
    }
  });

  it("cor ilegível não quebra a tela", () => {
    // Um valor inválido no banco não pode derrubar a renderização do cartão:
    // devolve a tinta padrão e segue.
    for (const invalida of ["", "azul", "#12345", "rgb(1,2,3)"]) {
      assert.equal(readableInk(invalida), "#ffffff", invalida);
    }
  });

  it("needsDarkInk concorda com readableInk", () => {
    for (const fundo of ["#f59e0b", "#1f2937", "#0d9668", "#2563eb"]) {
      assert.equal(needsDarkInk(fundo), readableInk(fundo) === "#10151c", fundo);
    }
  });
});
