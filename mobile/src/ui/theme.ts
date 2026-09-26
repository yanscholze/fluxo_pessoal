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
export type ThemeId = "light" | "dark";

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
  blurple: { base: "#7c3aed", wash: "#2b1c4a", edge: "#6436ae", soft: "#b9a9ff" },
  azul: { base: "#4f8cff", wash: "#101f3d", edge: "#2455a5", soft: "#9cc3ff" },
  verde: { base: "#10b981", wash: "#102c1c", edge: "#187e40", soft: "#8ce2aa" },
  coral: { base: "#f43f5e", wash: "#35131c", edge: "#9b2639", soft: "#ffa0b0" },
};

const makePalette = (accentId: AccentId, themeId: ThemeId): Palette => {
  const accent = ACCENTS[accentId];
  if (themeId === "light") return {
    canvas: "#eef4fb",
    surface: "#ffffff",
    surfaceRaised: "#ffffff",
    surfaceSunken: "#f8fbff",
    surfaceInset: "#f5f8fc",
    line: "#dce4ee",
    lineStrong: "#c9d4e2",
    ink: "#111827",
    inkMuted: "#6b7280",
    inkSubtle: "#798698",
    accent: accent.base,
    accentInk: "#ffffff",
    accentWash: `${accent.base}1c`,
    accentEdge: `${accent.base}55`,
    positive: "#10b981",
    positiveWash: "#e4f8f1",
    negative: "#f43f5e",
    negativeWash: "#fff0f3",
    caution: "#f59e0b",
    cautionWash: "#fff5df",
    info: "#4f8cff",
    infoWash: "#eaf2ff",
    viz: ["#4f8cff", "#f43f5e", "#8b5cf6", "#f59e0b", "#10b981", "#22d3ee", "#6366f1", "#64748b"],
  };
  return {
    canvas: "#0f1728",
    surface: "#131f34",
    surfaceRaised: "#17243a",
    surfaceSunken: "#111b2e",
    surfaceInset: "#1d2d49",
    line: "#29384e",
    lineStrong: "#3a4b63",
    ink: "#f8fafc",
    inkMuted: "#94a3b8",
    inkSubtle: "#8292a8",
    accent: accent.base,
    accentInk: "#ffffff",
    accentWash: accent.wash,
    accentEdge: accent.edge,
    positive: "#10b981",
    positiveWash: "#102c1c",
    negative: "#fb7185",
    negativeWash: "#35131c",
    caution: "#f59e0b",
    cautionWash: "#35250b",
    info: accent.base,
    infoWash: accent.wash,
    viz: ["#60a5fa", "#fb7185", "#a78bfa", "#fbbf24", "#34d399", "#22d3ee", "#818cf8", "#94a3b8"],
  };
};

type AppearanceContextValue = {
  readonly accentId: AccentId;
  readonly setAccentId: (accent: AccentId) => void;
  readonly themeId: ThemeId;
  readonly setThemeId: (theme: ThemeId) => void;
  readonly accents: typeof ACCENTS;
  readonly palette: Palette;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);
const ACCENT_STORAGE_KEY = "fluxo.appearance.accent";
const THEME_STORAGE_KEY = "fluxo.appearance.theme";

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [accentId, setAccentState] = useState<AccentId>("blurple");
  const [themeId, setThemeState] = useState<ThemeId>("light");

  useEffect(() => {
    void SecureStore.getItemAsync(ACCENT_STORAGE_KEY).then((saved) => {
      if (saved && saved in ACCENTS) setAccentState(saved as AccentId);
    });
    void SecureStore.getItemAsync(THEME_STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark") setThemeState(saved);
    });
  }, []);

  const setAccentId = (accent: AccentId) => {
    setAccentState(accent);
    void SecureStore.setItemAsync(ACCENT_STORAGE_KEY, accent);
  };
  const setThemeId = (theme: ThemeId) => {
    setThemeState(theme);
    void SecureStore.setItemAsync(THEME_STORAGE_KEY, theme);
  };

  const value = useMemo(
    () => ({ accentId, setAccentId, themeId, setThemeId, accents: ACCENTS, palette: makePalette(accentId, themeId) }),
    [accentId, themeId],
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
  return useAppearance().themeId === "dark";
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
export const radius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 28, pill: 999 };

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
