/**
 * A geometria da carteira, medida no protótipo.
 *
 * Isto aqui é aritmética pura, fora do React, por um motivo: é a parte da
 * animação que pode errar **em silêncio**. Um cartão que tomba para o lado
 * errado se vê na hora; um cartão que para 40px acima do lugar certo parece
 * apenas "um pouco estranho", e ninguém sabe dizer o quê.
 *
 * Todas as medidas vêm do quadro do Figma Make, que tem 440px de largura.
 * `regua` converte para a tela real — é o que faz o mesmo desenho caber num
 * telefone de 360 e num de 430 sem ninguém recalcular nada à mão.
 */

/** A largura do quadro do protótipo. Toda medida de lá está nesta escala. */
const QUADRO = 440;

/** Aberto, o cartão tomba de lado e cresce. Os dois números são do protótipo. */
export const GIRO_ABERTO = 90;
export const ESCALA_ABERTA = 1.75;

/** O vizinho fica um degrau abaixo, um degrau menor e bem apagado. */
export const ESCALA_VIZINHA = 0.95;
export const OPACIDADE_VIZINHA = 0.28;

/** O tempo e a curva do protótipo: `0.6s cubic-bezier(.23,1,.32,1)`. */
export const DURACAO = 600;
export const CURVA = [0.23, 1, 0.32, 1] as const;

/** Os gatilhos do protótipo: 30px para abrir ou fechar, 60 para trocar. */
export const LIMIAR_VERTICAL = 30;
export const LIMIAR_HORIZONTAL = 60;

export type GeometriaDaCarteira = {
  readonly regua: number;
  /**
   * Quanto do cartão aberto continua à vista, do alto da tela até a borda de
   * baixo dele. O resto sai pela parte de cima — é o "peek" que dá nome ao
   * estado no protótipo.
   */
  readonly faixaVisivel: number;
  /** O palco: quase a tela toda fechado, uma tira depois de aberto. */
  readonly palcoFechado: number;
  readonly palcoAberto: number;
  readonly degrauVizinho: number;
  /** Os pontos ficam abaixo do centro do palco e sobem ao sair de cena. */
  readonly pontosAbaixo: number;
  readonly pontosSobem: number;
  /** O painel de detalhes entra de baixo. */
  readonly entradaDoPainel: number;
};

export function geometriaDaCarteira(
  larguraDaTela: number,
  alturaDaTela: number,
): GeometriaDaCarteira {
  const regua = larguraDaTela / QUADRO;
  return {
    regua,
    faixaVisivel: 128 * regua,
    palcoFechado: Math.max(430 * regua, alturaDaTela - 230 * regua),
    palcoAberto: 82 * regua,
    degrauVizinho: 8 * regua,
    pontosAbaixo: 135 * regua,
    pontosSobem: 20 * regua,
    entradaDoPainel: 220 * regua,
  };
}

/**
 * Quanto o cartão sobe ao abrir.
 *
 * Girado e ampliado, a caixa do cartão passa a ter a **largura** da face como
 * altura — por isso é `larguraDaFace`, e não a altura, que entra na conta. O
 * destino é o centro dessa caixa nova, posto de modo que a borda de baixo pare
 * exatamente na faixa que o protótipo deixa à vista.
 */
export function deslocamentoDoCartao(
  geometria: GeometriaDaCarteira,
  topoDoPalco: number,
  larguraDaFace: number,
): number {
  const centroFechado = topoDoPalco + geometria.palcoFechado / 2;
  const centroAberto = geometria.faixaVisivel - (larguraDaFace * ESCALA_ABERTA) / 2;
  return centroAberto - centroFechado;
}

/**
 * Onde a borda de baixo do cartão aberto para, contada do alto da tela.
 *
 * Existe para o teste: é a propriedade que define a pose aberta no protótipo,
 * e a única forma de conferir que a conta acima continua chegando nela.
 */
export function bordaDeBaixoDoCartaoAberto(
  geometria: GeometriaDaCarteira,
  topoDoPalco: number,
  larguraDaFace: number,
): number {
  const centroAberto =
    topoDoPalco +
    geometria.palcoFechado / 2 +
    deslocamentoDoCartao(geometria, topoDoPalco, larguraDaFace);
  return centroAberto + (larguraDaFace * ESCALA_ABERTA) / 2;
}
