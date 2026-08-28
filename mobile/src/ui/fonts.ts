/**
 * Carregamento da tipografia.
 *
 * A mesma Figtree do site, empacotada como TTF: o React Native não lê woff2, e
 * o Android não interpola eixo de peso de fonte variável — por isso são quatro
 * arquivos estáticos, e não um variável.
 *
 * A família é aplicada num lugar só, em `<Texto>` de `primitives.tsx`. Repetir
 * `fontFamily` em cada estilo faria um esquecimento virar um bloco em Roboto no
 * meio da tela, que é o defeito mais visível de aplicativo mal acabado.
 */

import { useFonts } from "expo-font";

export const FONTES = {
  "Figtree-Regular": require("../../assets/fonts/Figtree-Regular.ttf"),
  "Figtree-Medium": require("../../assets/fonts/Figtree-Medium.ttf"),
  "Figtree-SemiBold": require("../../assets/fonts/Figtree-SemiBold.ttf"),
  "Figtree-Bold": require("../../assets/fonts/Figtree-Bold.ttf"),
} as const;

/**
 * Nome do arquivo por peso.
 *
 * No Android, `fontWeight` não escolhe entre arquivos de uma família: cada peso
 * é uma família própria. Sem esta tabela, tudo renderiza no regular e a
 * hierarquia tipográfica some.
 */
export function familiaDoPeso(peso: string | number | undefined): string {
  const valor = Number(peso ?? 400);
  if (valor >= 700) return "Figtree-Bold";
  if (valor >= 600) return "Figtree-SemiBold";
  if (valor >= 500) return "Figtree-Medium";
  return "Figtree-Regular";
}

export function useTipografia(): boolean {
  const [carregada] = useFonts(FONTES);
  return carregada;
}
