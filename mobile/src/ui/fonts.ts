import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  useFonts,
} from "@expo-google-fonts/dm-sans";

export const FONTES = {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} as const;

export function familiaDoPeso(peso: string | number | undefined): string {
  const valor = Number(peso ?? 400);
  if (valor >= 700) return "DMSans_700Bold";
  if (valor >= 600) return "DMSans_600SemiBold";
  if (valor >= 500) return "DMSans_500Medium";
  return "DMSans_400Regular";
}

export function useTipografia(): boolean {
  const [carregada] = useFonts(FONTES);
  return carregada;
}
