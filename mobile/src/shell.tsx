/**
 * Casca do aplicativo: abas e a folha de lançamento.
 *
 * A navegação é escrita à mão em vez de trazer uma biblioteca. São quatro abas
 * e uma folha modal — o que uma biblioteca de navegação resolveria aqui é
 * histórico profundo e deep linking, que este aplicativo não tem. Trocar isso
 * por três dependências e uma configuração de gestos seria peso sem retorno.
 *
 * A aba não é rota: o estado da tela não sobrevive à troca de aba de
 * propósito. Tudo que importa mora no banco local, e nada aqui guarda dado que
 * o usuário perderia.
 */

import { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AjustesScreen } from "./screens/ajustes.tsx";
import { CapturasScreen } from "./screens/capturas.tsx";
import { ExtratoScreen } from "./screens/extrato.tsx";
import { InicioScreen } from "./screens/inicio.tsx";
import { LancamentoScreen } from "./screens/lancamento.tsx";
import { useLedger } from "./state/ledger.tsx";
import { radius, space, type, usePalette } from "./ui/theme.ts";

type Aba = "inicio" | "extrato" | "capturas" | "ajustes";

const ABAS: readonly { readonly id: Aba; readonly label: string }[] = [
  { id: "inicio", label: "Início" },
  { id: "extrato", label: "Extrato" },
  { id: "capturas", label: "Capturas" },
  { id: "ajustes", label: "Ajustes" },
];

export function Shell() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { transactions, sync } = useLedger();

  const [aba, setAba] = useState<Aba>("inicio");
  const [editando, setEditando] = useState<string | null>(null);
  const [folhaAberta, setFolhaAberta] = useState(false);

  const emEdicao = useMemo(
    () => (editando ? (transactions.find((item) => item.id === editando) ?? null) : null),
    [editando, transactions],
  );

  function abrirLancamento(id: string | null) {
    setEditando(id);
    setFolhaAberta(true);
  }

  function fecharLancamento() {
    setFolhaAberta(false);
    setEditando(null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
      <View style={{ flex: 1 }}>
        {aba === "inicio" ? (
          <InicioScreen onOpenTransaction={abrirLancamento} />
        ) : aba === "extrato" ? (
          <ExtratoScreen onOpenTransaction={abrirLancamento} />
        ) : aba === "capturas" ? (
          <CapturasScreen />
        ) : (
          <AjustesScreen />
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Novo lançamento"
        onPress={() => abrirLancamento(null)}
        style={({ pressed }) => ({
          position: "absolute",
          right: space.lg,
          bottom: insets.bottom + 76,
          width: 56,
          height: 56,
          borderRadius: radius.pill,
          backgroundColor: palette.accent,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
          elevation: 4,
        })}
      >
        <Text style={{ color: palette.accentInk, fontSize: 28, lineHeight: 32, fontWeight: "400" }}>+</Text>
      </Pressable>

      <View
        style={{
          flexDirection: "row",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.line,
          backgroundColor: palette.surface,
          paddingBottom: insets.bottom,
        }}
      >
        {ABAS.map((item) => {
          const ativo = item.id === aba;
          const alerta = item.id === "ajustes" && sync.unresolved > 0;

          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: ativo }}
              onPress={() => setAba(item.id)}
              style={{ flex: 1, alignItems: "center", paddingVertical: space.md }}
            >
              <Text style={[type.small, { color: ativo ? palette.accent : palette.inkSubtle }]}>
                {item.label}
                {alerta ? " •" : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Modal
        visible={folhaAberta}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={fecharLancamento}
      >
        <LancamentoScreen existing={emEdicao} onClose={fecharLancamento} />
      </Modal>
    </View>
  );
}
