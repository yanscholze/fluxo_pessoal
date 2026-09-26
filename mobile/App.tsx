/**
 * Raiz do aplicativo.
 *
 * Ordem dos provedores importa: a sessão decide se existe conta conectada, e o
 * estado financeiro só faz sentido dentro dela. Invertê-los faria o razão
 * tentar derivar números sem saber de quem são.
 */

import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { ConectarScreen } from "./src/screens/conectar.tsx";
import { useTipografia } from "./src/ui/fonts.ts";
import { Shell } from "./src/shell.tsx";
import { LedgerProvider } from "./src/state/ledger.tsx";
import { SessionProvider, useSession } from "./src/state/session.tsx";
import { AppearanceProvider, useIsDark, usePalette } from "./src/ui/theme.ts";

export default function App() {
  return (
    /*
     * `GestureHandlerRootView` envolve tudo, e precisa ser a raiz de verdade:
     * qualquer gesto declarado abaixo dela funciona, e qualquer um acima
     * simplesmente não dispara — sem erro, sem aviso, só um arrasto que não
     * acontece. É a pegadinha mais comum da biblioteca.
     */
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppearanceProvider>
          <SessionProvider>
            <Raiz />
          </SessionProvider>
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Raiz() {
  const palette = usePalette();
  const isDark = useIsDark();
  const { state } = useSession();
  const tipografiaPronta = useTipografia();

  // Segurar a primeira pintura até a fonte chegar evita o salto de texto que
  // acontece quando o Roboto do sistema é substituído meio segundo depois — e
  // são poucos milissegundos, porque os arquivos vêm empacotados no APK.
  if (!tipografiaPronta || state.status === "carregando") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.canvas }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  if (state.status === "desconectado") {
    return (
      <>
        <StatusBar style={isDark ? "light" : "dark"} />
        <ConectarScreen />
      </>
    );
  }

  return (
    <LedgerProvider>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Shell />
    </LedgerProvider>
  );
}
