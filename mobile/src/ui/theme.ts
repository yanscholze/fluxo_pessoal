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
  blurple: { base: "#7c5cfc", wash: "#201942", edge: "#4936a1", soft: "#b9a9ff" },
  azul: { base: "#3b82f6", wash: "#101f3d", edge: "#2455a5", soft: "#9cc3ff" },
  verde: { base: "#22c55e", wash: "#102c1c", edge: "#187e40", soft: "#8ce2aa" },
  coral: { base: "#f43f5e", wash: "#35131c", edge: "#9b2639", soft: "#ffa0b0" },
};

const makePalette = (accentId: AccentId): Palette => {
  const accent = ACCENTS[accentId];
  return {
    canvas: "#0a0a0f",
    surface: "#12121a",
    surfaceRaised: "#171722",
    surfaceSunken: "#0d0d14",
    surfaceInset: "#1a1a28",
    line: "#1e1e30",
    lineStrong: "#303047",
    ink: "#f0f0f8",
    inkMuted: "#b0b0c8",
    inkSubtle: "#6b6b88",
    accent: accent.base,
    accentInk: "#ffffff",
    accentWash: accent.wash,
    accentEdge: accent.edge,
    positive: "#22c55e",
    positiveWash: "#102c1c",
    negative: "#f43f5e",
    negativeWash: "#35131c",
    caution: "#f59e0b",
    cautionWash: "#35250b",
    info: accent.base,
    infoWash: accent.wash,
    viz: [accent.base, "#22c55e", "#f43f5e", "#f59e0b", "#3b82f6", "#a855f7", "#14b8a6", "#6b6b88"],
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
  display: { fontSize: 48, lineHeight: 52, fontWeight: "700" as const, letterSpacing: -2.1 },
  figure: { fontSize: 28, lineHeight: 34, fontWeight: "700" as const, letterSpacing: -0.8 },
  figureSm: { fontSize: 18, lineHeight: 23, fontWeight: "600" as const, letterSpacing: -0.3 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "700" as const, letterSpacing: -0.6 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: "600" as const, letterSpacing: -0.2 },
  body: { fontSize: 14, lineHeight: 20, fontWeight: "400" as const },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontWeight: "600" as const },
  bodySm: { fontSize: 12, lineHeight: 17, fontWeight: "400" as const },
  caption: { fontSize: 10.5, lineHeight: 14, fontWeight: "400" as const },
  label: { fontSize: 10, lineHeight: 13, fontWeight: "500" as const, letterSpacing: 0.8 },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
export const radius = { xs: 6, sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

export const elevation = {
  panel: {
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
  },
  float: {
    elevation: 14,
    shadowColor: ACCENTS.blurple.base,
    shadowOpacity: 0.42,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 9 },
  },
};
