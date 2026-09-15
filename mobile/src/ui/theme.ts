import * as SecureStore from "expo-secure-store";
import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type AccentId = "blurple" | "azul" | "verde" | "coral";

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
  readonly viz: readonly string[];
};

const ACCENTS: Record<AccentId, { base: string; wash: string; edge: string; soft: string }> = {
  blurple: { base: "#9184d9", wash: "#2b2741", edge: "#5d5294", soft: "#d2cefd" },
  azul: { base: "#72a7df", wash: "#202d42", edge: "#4c6f98", soft: "#c9e1fa" },
  verde: { base: "#69b69f", wash: "#1d3732", edge: "#477f70", soft: "#c6eadf" },
  coral: { base: "#d7877f", wash: "#432927", edge: "#965e59", soft: "#f2d0cd" },
};

const makePalette = (accentId: AccentId): Palette => {
  const accent = ACCENTS[accentId];
  return {
    canvas: "#161826",
    surface: "#232532",
    surfaceRaised: "#292b31",
    surfaceSunken: "#1c1e29",
    surfaceInset: "#292b31",
    line: "#3f424d",
    lineStrong: "#595d6c",
    ink: "#e9e9ed",
    inkMuted: "#b2b6ca",
    inkSubtle: "#9397ab",
    accent: accent.base,
    accentInk: "#161826",
    accentWash: accent.wash,
    accentEdge: accent.edge,
    positive: "#9bceb7",
    positiveWash: "#1d332b",
    negative: "#e59a9a",
    negativeWash: "#402528",
    caution: "#d4b275",
    cautionWash: "#3b3120",
    info: accent.base,
    infoWash: accent.wash,
    viz: [accent.base, "#72a7df", "#d4b275", "#d7877f", "#69b69f", "#b991cf", "#9cb568", "#9397ab"],
  };
};

type AppearanceContextValue = {
  readonly accentId: AccentId;
  readonly setAccentId: (accent: AccentId) => void;
  readonly accents: typeof ACCENTS;
  readonly palette: Palette;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);
const ACCENT_STORAGE_KEY = "fluxo.appearance.accent";

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [accentId, setAccentState] = useState<AccentId>("blurple");

  useEffect(() => {
    void SecureStore.getItemAsync(ACCENT_STORAGE_KEY).then((saved) => {
      if (saved && saved in ACCENTS) setAccentState(saved as AccentId);
    });
  }, []);

  const setAccentId = (accent: AccentId) => {
    setAccentState(accent);
    void SecureStore.setItemAsync(ACCENT_STORAGE_KEY, accent);
  };

  const value = useMemo(
    () => ({ accentId, setAccentId, accents: ACCENTS, palette: makePalette(accentId) }),
    [accentId],
  );

  return createElement(AppearanceContext.Provider, { value }, children);
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance precisa de AppearanceProvider");
  return value;
}

export function usePalette(): Palette {
  return useAppearance().palette;
}

export function useIsDark(): boolean {
  return true;
}

export const type = {
  display: { fontSize: 42, lineHeight: 44, fontWeight: "500" as const, letterSpacing: -1.35 },
  figure: { fontSize: 26, lineHeight: 30, fontWeight: "500" as const, letterSpacing: -0.62 },
  figureSm: { fontSize: 19, lineHeight: 23, fontWeight: "500" as const, letterSpacing: -0.34 },
  title: { fontSize: 22, lineHeight: 27, fontWeight: "500" as const, letterSpacing: -0.44 },
  heading: { fontSize: 17, lineHeight: 21, fontWeight: "500" as const, letterSpacing: -0.25 },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontWeight: "500" as const },
  bodySm: { fontSize: 12.5, lineHeight: 18, fontWeight: "400" as const },
  caption: { fontSize: 11.5, lineHeight: 16, fontWeight: "400" as const },
  label: { fontSize: 10.5, lineHeight: 13, fontWeight: "500" as const, letterSpacing: 1.25 },
};

export const space = { xs: 3, sm: 6, md: 8, lg: 11, xl: 17, xxl: 22 };
export const radius = { xs: 4, sm: 4, md: 8, lg: 14, xl: 14, pill: 999 };

export const elevation = {
  panel: {
    elevation: 1,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  float: {
    elevation: 9,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
};
