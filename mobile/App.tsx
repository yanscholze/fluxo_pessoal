/**
 * Raiz do aplicativo.
 *
 * Ordem dos provedores importa: a sessão decide se existe conta conectada, e o
 * estado financeiro só faz sentido dentro dela. Invertê-los faria o razão
 * tentar derivar números sem saber de quem são.
 */

import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { ConectarScreen } from "./src/screens/conectar.tsx";
import { useTipografia } from "./src/ui/fonts.ts";
import { Shell } from "./src/shell.tsx";
import { LedgerProvider } from "./src/state/ledger.tsx";
import { SessionProvider, useSession } from "./src/state/session.tsx";
import { usePalette } from "./src/ui/theme.ts";

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Raiz />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Raiz() {
  const palette = usePalette();
  const { state } = useSession();
  const tipografiaPronta = useTipografia();

  // Segurar a primeira pintura até a fonte chegar evita o salto de texto que
  // acontece quando o Roboto do sistema é substituído meio segundo depois — e
  // são poucos milissegundos, porque os arquivos vêm empacotados no APK.
  if (!tipografiaPronta || state.status === "carregando") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.canvas }}>
        <StatusBar style="auto" />
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  if (state.status === "desconectado") {
    return (
      <>
        <StatusBar style="auto" />
        <ConectarScreen />
      </>
    );
  }

  return (
    <LedgerProvider>
      <StatusBar style="auto" />
      <Shell />
    </LedgerProvider>
  );
}
