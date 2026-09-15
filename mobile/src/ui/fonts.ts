import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";

export const FONTES = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} as const;

export function familiaDoPeso(peso: string | number | undefined): string {
  const valor = Number(peso ?? 400);
  if (valor >= 700) return "Inter_700Bold";
  if (valor >= 600) return "Inter_600SemiBold";
  if (valor >= 500) return "Inter_500Medium";
  return "Inter_400Regular";
}

export function useTipografia(): boolean {
  const [carregada] = useFonts(FONTES);
  return carregada;
}
