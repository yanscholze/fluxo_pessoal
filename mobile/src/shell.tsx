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
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AjustesScreen } from "./screens/ajustes.tsx";
import { CapturasScreen } from "./screens/capturas.tsx";
import { CartoesScreen } from "./screens/cartoes.tsx";
import { ExtratoScreen } from "./screens/extrato.tsx";
import { InicioScreen } from "./screens/inicio.tsx";
import { LancamentoScreen } from "./screens/lancamento.tsx";
import { OrcamentosScreen } from "./screens/orcamentos.tsx";
import { useLedger } from "./state/ledger.tsx";
import { Texto } from "./ui/primitives.tsx";
import { radius, space, type, usePalette } from "./ui/theme.ts";

type Aba = "inicio" | "extrato" | "cartoes" | "orcamentos" | "ajustes" | "capturas";

/**
 * As abas do celular não espelham as dezenove telas do site, e não deveriam.
 * Aqui cabem as consultas de bolso — o que se abre de pé, na fila do caixa:
 * quanto sobra, o que saiu, quanto devo no cartão, quanto ainda posso gastar.
 * Importação, relatórios e cadastro continuam sendo trabalho de mesa.
 *
 * Capturas saiu da barra e virou atalho no Início: é fila de revisão, não
 * consulta, e ocupava um quinto do espaço de navegação para algo que na maior
 * parte dos dias está vazio.
 */
const ABAS: readonly { readonly id: Aba; readonly label: string }[] = [
  { id: "inicio", label: "Início" },
  { id: "extrato", label: "Extrato" },
  { id: "cartoes", label: "Cartões" },
  { id: "orcamentos", label: "Orçamento" },
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
        ) : aba === "cartoes" ? (
          <CartoesScreen />
        ) : aba === "orcamentos" ? (
          <OrcamentosScreen />
        ) : aba === "capturas" ? (
          <CapturasScreen onVoltar={() => setAba("ajustes")} />
        ) : (
          <AjustesScreen onAbrirCapturas={() => setAba("capturas")} />
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
        <Texto style={{ color: palette.accentInk, fontSize: 28, lineHeight: 32, fontWeight: "400" }}>+</Texto>
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
              <Texto style={[type.bodySm, { color: ativo ? palette.accent : palette.inkSubtle }]}>
                {item.label}
                {alerta ? " •" : ""}
              </Texto>
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
