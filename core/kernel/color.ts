/**
 * Que tinta é legível sobre uma cor.
 *
 * A face do cartão pinta o fundo com a cor que o usuário escolheu e escreve o
 * nome por cima. Com a tinta fixa em branco, metade da paleta de partida fica
 * abaixo do mínimo de leitura — âmbar dá 2,15:1, que é texto que se adivinha,
 * não se lê. E o seletor aceita qualquer cor, então nenhuma lista de exceções
 * resolveria.
 *
 * A conta é a da WCAG: luminância relativa dos dois candidatos, e vence o de
 * maior contraste. Não é preferência estética — é a mesma régua que a
 * ferramenta de auditoria usa.
 */

/** Tinta clara e tinta escura do produto, nesta ordem de teste. */
const CLARA = "#ffffff";
const ESCURA = "#10151c";

function canais(hex: string): [number, number, number] | null {
  const limpo = hex.trim().replace(/^#/, "");
  const cheio =
    limpo.length === 3
      ? limpo
          .split("")
          .map((digito) => digito + digito)
          .join("")
      : limpo;

  if (!/^[0-9a-f]{6}$/i.test(cheio)) return null;

  const valor = Number.parseInt(cheio, 16);
  return [(valor >> 16) & 255, (valor >> 8) & 255, valor & 255];
}

/** Luminância relativa, entre 0 (preto) e 1 (branco). */
export function luminance(hex: string): number {
  const rgb = canais(hex);
  if (!rgb) return 0;

  const [r, g, b] = rgb.map((canal) => {
    const escala = canal / 255;
    return escala <= 0.03928 ? escala / 12.92 : ((escala + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste entre duas cores, de 1:1 a 21:1. */
export function contrastRatio(um: string, outro: string): number {
  const claro = Math.max(luminance(um), luminance(outro));
  const escuro = Math.min(luminance(um), luminance(outro));
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * A tinta que se lê sobre este fundo.
 *
 * Cor ilegível pelo parser cai na tinta clara: o fundo provavelmente também
 * não pintou, e o padrão do produto é escuro.
 */
export function readableInk(background: string): string {
  if (!canais(background)) return CLARA;
  return contrastRatio(CLARA, background) >= contrastRatio(ESCURA, background) ? CLARA : ESCURA;
}

/** `true` quando a tinta legível é a escura — útil para escolher classes. */
export function needsDarkInk(background: string): boolean {
  return readableInk(background) === ESCURA;
}
