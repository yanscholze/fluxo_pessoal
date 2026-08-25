/**
 * Tokens visuais do aplicativo.
 *
 * Espelham `app/globals.css` — os mesmos valores, porque site e aplicativo
 * precisam parecer o mesmo produto. Não dá para importar de lá: React Native
 * não lê CSS. É a única duplicação aceita neste projeto, e é de aparência, não
 * de regra: um token errado desalinha uma cor, não um saldo.
 *
 * Tudo o que uma tela usa sai daqui. Cor solta no meio de um componente é
 * como a versão anterior chegou a ter cinco cinzas diferentes.
 */

import { useColorScheme } from "react-native";

export type Palette = {
  readonly canvas: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceSunken: string;
  readonly line: string;
  readonly lineStrong: string;
  readonly ink: string;
  readonly inkMuted: string;
  readonly inkSubtle: string;
  readonly accent: string;
  readonly accentInk: string;
  readonly accentWash: string;
  readonly positive: string;
  readonly positiveWash: string;
  readonly negative: string;
  readonly negativeWash: string;
  readonly caution: string;
  readonly cautionWash: string;
};

const LIGHT: Palette = {
  canvas: "#f7f7f9",
  surface: "#ffffff",
  surfaceRaised: "#ffffff",
  surfaceSunken: "#f1f1f4",
  line: "#e3e3e8",
  lineStrong: "#d1d1d9",
  ink: "#17171c",
  inkMuted: "#63636e",
  inkSubtle: "#8f8f9c",
  accent: "#7c5cff",
  accentInk: "#ffffff",
  accentWash: "#efebff",
  positive: "#0d9f6e",
  positiveWash: "#e2f5ee",
  negative: "#dc2b3d",
  negativeWash: "#fdeaec",
  caution: "#c77700",
  cautionWash: "#fdf0dd",
};

const DARK: Palette = {
  canvas: "#0b0b0f",
  surface: "#141419",
  surfaceRaised: "#1b1b22",
  surfaceSunken: "#101015",
  line: "#26262f",
  lineStrong: "#35353f",
  ink: "#f2f2f5",
  inkMuted: "#a0a0ae",
  inkSubtle: "#6e6e7d",
  accent: "#9d84ff",
  accentInk: "#12101f",
  accentWash: "#211c38",
  positive: "#34d399",
  positiveWash: "#10291f",
  negative: "#f87171",
  negativeWash: "#2c1418",
  caution: "#f5a524",
  cautionWash: "#2c2110",
};

/** Escala tipográfica. Hierarquia explícita: o número que responde é grande. */
export const type = {
  figure: { fontSize: 40, lineHeight: 44, fontWeight: "700" as const, letterSpacing: -1 },
  figureSmall: { fontSize: 22, lineHeight: 26, fontWeight: "600" as const, letterSpacing: -0.4 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const, letterSpacing: -0.3 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: "400" as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: "600" as const },
  small: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "600" as const, letterSpacing: 0.8 },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { card: 14, control: 10, pill: 999 };

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? DARK : LIGHT;
}
