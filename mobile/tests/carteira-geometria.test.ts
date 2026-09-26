/**
 * A pose aberta do cartão, contra o protótipo.
 *
 * Os números de referência não foram deduzidos: o protótipo do Figma Make foi
 * recuperado em `docs/figma/screens/CardsScreen.tsx`, montado num quadro de
 * 440px e medido com `getBoundingClientRect`. Com a carteira aberta, a caixa
 * do cartão de 400px ficava com 385×700 e a borda de baixo dela parava a
 * **128px do alto da tela** — o resto sai por cima. É essa faixa que dá nome
 * ao estado ("peek") e é ela que estes testes fixam.
 *
 * O que pode errar em silêncio aqui é a conta do deslocamento. Um cartão que
 * tomba para o lado errado se vê na hora; um que para quarenta pixels acima do
 * lugar parece apenas "um pouco estranho", e ninguém sabe dizer o quê.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CURVA,
  DURACAO,
  ESCALA_ABERTA,
  ESCALA_VIZINHA,
  GIRO_ABERTO,
  LIMIAR_HORIZONTAL,
  LIMIAR_VERTICAL,
  OPACIDADE_VIZINHA,
  bordaDeBaixoDoCartaoAberto,
  deslocamentoDoCartao,
  geometriaDaCarteira,
} from "../src/ui/carteira-geometria.ts";

/** O quadro do protótipo, onde as medidas de referência foram tiradas. */
const QUADRO = { largura: 440, altura: 900, face: 400 };

describe("geometria da carteira", () => {
  it("reproduz as medidas do protótipo no quadro dele", () => {
    const g = geometriaDaCarteira(QUADRO.largura, QUADRO.altura);

    assert.equal(g.regua, 1, "no quadro de 440 a régua é 1 para 1");
    assert.equal(g.faixaVisivel, 128);
    assert.equal(g.palcoAberto, 82);
    assert.equal(g.degrauVizinho, 8);
    assert.equal(g.pontosAbaixo, 135);
    assert.equal(g.pontosSobem, 20);
    assert.equal(g.entradaDoPainel, 220);

    assert.equal(GIRO_ABERTO, 90);
    assert.equal(ESCALA_ABERTA, 1.75);
    assert.equal(ESCALA_VIZINHA, 0.95);
    assert.equal(OPACIDADE_VIZINHA, 0.28);
    assert.equal(DURACAO, 600);
    assert.deepEqual([...CURVA], [0.23, 1, 0.32, 1]);
    assert.equal(LIMIAR_VERTICAL, 30);
    assert.equal(LIMIAR_HORIZONTAL, 60);
  });

  it("para a borda de baixo do cartão na faixa, venha o palco de onde vier", () => {
    /*
     * A altura do palco muda com a tela, e o cabeçalho empurra o topo dele
     * para baixo. A pose aberta não pode depender de nenhum dos dois: o
     * deslocamento tem de compensar os dois e chegar sempre na mesma faixa.
     */
    const g = geometriaDaCarteira(QUADRO.largura, QUADRO.altura);

    for (const topo of [0, 68, 103, 180]) {
      assert.equal(
        Math.round(bordaDeBaixoDoCartaoAberto(g, topo, QUADRO.face)),
        Math.round(g.faixaVisivel),
        `com o palco começando em ${topo}`,
      );
    }
  });

  it("leva a faixa junto quando a tela é menor", () => {
    const pequeno = geometriaDaCarteira(390, 844);

    assert.equal(Math.round(pequeno.faixaVisivel), Math.round((128 * 390) / 440));
    assert.equal(
      Math.round(bordaDeBaixoDoCartaoAberto(pequeno, 68, 350)),
      Math.round(pequeno.faixaVisivel),
    );
  });

  it("sobe o cartão: o deslocamento é sempre negativo", () => {
    // Se um dia der positivo, o cartão desceu — e o gesto é "arraste para
    // cima". O sinal é a diferença entre a animação certa e a do avesso.
    for (const [largura, altura, face] of [
      [360, 640, 320],
      [390, 844, 350],
      [430, 932, 360],
    ] as const) {
      const g = geometriaDaCarteira(largura, altura);
      assert.ok(
        deslocamentoDoCartao(g, 68, face) < 0,
        `tela de ${largura}x${altura} devolveu deslocamento para baixo`,
      );
    }
  });

  it("guarda o palco fechado para a tela baixa e o abre na tela alta", () => {
    // `max(430, altura - 230)` na régua do quadro: numa tela curta o mínimo
    // segura o palco, numa alta ele acompanha a tela.
    assert.equal(geometriaDaCarteira(440, 600).palcoFechado, 430);
    assert.equal(geometriaDaCarteira(440, 900).palcoFechado, 670);
  });
});
