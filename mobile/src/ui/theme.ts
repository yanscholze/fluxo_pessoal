/**
 * Tokens visuais do aplicativo.
 *
 * Espelham `app/globals.css` — os mesmos valores, porque site e aplicativo
 * precisam parecer o mesmo produto. Não dá para importar de lá: React Native
 * não lê CSS. É a única duplicação aceita neste projeto, e é de aparência, não
 * de regra: um token errado desalinha uma cor, não um saldo.
 *
 * Tudo o que uma tela usa sai daqui. Cor solta no meio de um componente é como
 * a versão anterior chegou a ter cinco cinzas diferentes.
 *
 * As três decisões do sistema valem igual aqui:
 *
 * 1. **Escuro é o tema nativo.** Os valores escuros vieram primeiro, pensados
 *    para leitura longa de tabela financeira; o claro foi derivado depois.
 *
 * 2. **Cor tem função.** O acento veste cromo interativo — aba ativa, botão
 *    primário, foco. Positivo e negativo vestem **valor**. Contextos disjuntos,
 *    então o verde de marca nunca disputa significado com o verde de receita.
 *
 * 3. **Superfície separa, borda não.** Hierarquia por elevação e espaço.
 */

import { useColorScheme } from "react-native";

export type Palette = {
  readonly canvas: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceSunken: string;
  readonly surfaceInset: string;
  readonly line: string;
  readonly lineStrong: string;
  readonly ink: string;
  readonly inkMuted: string;
  readonly inkSubtle: string;
  readonly accent: string;
  readonly accentInk: string;
  readonly accentWash: string;
  readonly accentEdge: string;
  readonly positive: string;
  readonly positiveWash: string;
  readonly negative: string;
  readonly negativeWash: string;
  readonly caution: string;
  readonly cautionWash: string;
  readonly info: string;
  readonly infoWash: string;
  /** Série de apoio para gráficos e para categorias sem cor própria. */
  readonly viz: readonly string[];
};

const LIGHT: Palette = {
  canvas: "#f6f7f9",
  surface: "#ffffff",
  surfaceRaised: "#ffffff",
  surfaceSunken: "#f0f2f5",
  surfaceInset: "#eaedf1",
  line: "#e2e6ec",
  lineStrong: "#cdd3dc",
  ink: "#10151c",
  inkMuted: "#5b6572",
  inkSubtle: "#8b95a3",
  accent: "#0d9668",
  accentInk: "#ffffff",
  accentWash: "#e3f3ec",
  accentEdge: "#a8d9c6",
  positive: "#16a34a",
  positiveWash: "#e4f4ea",
  negative: "#dc2626",
  negativeWash: "#fce9e9",
  caution: "#b45309",
  cautionWash: "#f8eddf",
  info: "#2563eb",
  infoWash: "#e5ecfc",
  viz: ["#0d9668", "#2563eb", "#b45309", "#9333ea", "#0891b2", "#db2777", "#65a30d", "#64748b"],
};

const DARK: Palette = {
  canvas: "#08090b",
  surface: "#0f1114",
  surfaceRaised: "#171a1f",
  surfaceSunken: "#0b0d10",
  surfaceInset: "#131619",
  line: "#1d2126",
  lineStrong: "#2b3138",
  ink: "#e9ecef",
  inkMuted: "#99a2ac",
  inkSubtle: "#6a737e",
  accent: "#21c99a",
  accentInk: "#04231b",
  accentWash: "#10241f",
  accentEdge: "#1e4c40",
  positive: "#4ade80",
  positiveWash: "#12251a",
  negative: "#ff6b6b",
  negativeWash: "#2a1517",
  caution: "#fbbf24",
  cautionWash: "#2a2110",
  info: "#60a5fa",
  infoWash: "#111c2c",
  viz: ["#21c99a", "#60a5fa", "#fbbf24", "#c084fc", "#22d3ee", "#fb7185", "#a3e635", "#94a3b8"],
};

/**
 * Escala tipográfica.
 *
 * Os mesmos degraus do site, em pixels e com um ajuste: `display` é menor aqui.
 * Os 40 px do site estouram numa tela de 360 px assim que o valor passa de seis
 * dígitos, e um número que quebra em duas linhas deixa de ser leitura de
 * relance.
 *
 * `fontFamily` fica de fora de propósito: quem a aplica é `<Texto>` em
 * `primitives.tsx`, uma vez, lendo a família carregada. Repeti-la em cada
 * estilo faria um esquecimento virar um bloco em Roboto no meio da tela.
 */
export const type = {
  display: { fontSize: 32, lineHeight: 36, fontWeight: "700" as const, letterSpacing: -1 },
  figure: { fontSize: 25, lineHeight: 29, fontWeight: "700" as const, letterSpacing: -0.55 },
  figureSm: { fontSize: 19, lineHeight: 23, fontWeight: "600" as const, letterSpacing: -0.3 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: "600" as const, letterSpacing: -0.35 },
  heading: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, letterSpacing: -0.1 },
  body: { fontSize: 15, lineHeight: 21, fontWeight: "400" as const },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: "600" as const },
  bodySm: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "400" as const },
  label: { fontSize: 11, lineHeight: 14, fontWeight: "700" as const, letterSpacing: 0.7 },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, pill: 999 };

/**
 * Elevação.
 *
 * Duas sombras, discretas. No Android quem manda é `elevation`; `shadowColor` e
 * companhia existem para o iOS, que ignora a primeira — declarar as duas é o
 * que mantém a mesma peça parecida nos dois sistemas.
 */
export const elevation = {
  panel: {
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  float: {
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
};

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? DARK : LIGHT;
}

export function useIsDark(): boolean {
  return useColorScheme() === "dark";
}
