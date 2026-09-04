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
import { elevation, radius, space, type, usePalette } from "./ui/theme.ts";

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
          <InicioScreen onOpenTransaction={abrirLancamento} onAbrirAjustes={() => setAba("ajustes")} />
        ) : aba === "extrato" ? (
          <ExtratoScreen onOpenTransaction={abrirLancamento} />
        ) : aba === "cartoes" ? (
          <CartoesScreen />
        ) : aba === "orcamentos" ? (
          <OrcamentosScreen />
        ) : aba === "capturas" ? (
          <CapturasScreen onVoltar={() => setAba("ajustes")} />
        ) : (
          <AjustesScreen onAbrirCapturas={() => setAba("capturas")} onVoltar={() => setAba("inicio")} />
        )}
      </View>

      {/*
        A barra inferior: quatro destinos e a ação no meio.

        O botão flutuante que existia antes tapava o canto do conteúdo e ficava
        longe do polegar em telas grandes. No meio da barra ele é o alvo mais
        fácil de acertar da tela inteira — e é a ação que este aplicativo existe
        para tornar rápida.
      */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "stretch",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.line,
          backgroundColor: palette.surface,
          paddingBottom: insets.bottom,
        }}
      >
        {ABAS.slice(0, 2).map((item) => (
          <ItemDeAba
            key={item.id}
            item={item}
            ativo={item.id === aba}
            alerta={item.id === "inicio" && sync.unresolved > 0}
            onPress={() => setAba(item.id)}
          />
        ))}

        <View style={{ width: 68, alignItems: "center", justifyContent: "flex-start" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Novo lançamento"
            onPress={() => abrirLancamento(null)}
            style={({ pressed }) => ({
              width: 52,
              height: 52,
              // Sobe para fora da barra: é o que o distingue de um quinto
              // destino e o torna o alvo evidente.
              marginTop: -14,
              borderRadius: radius.pill,
              backgroundColor: palette.accent,
              alignItems: "center",
              justifyContent: "center",
              transform: [{ scale: pressed ? 0.94 : 1 }],
              ...elevation.float,
            })}
          >
            <Texto
              style={{ color: palette.accentInk, fontSize: 26, lineHeight: 30, fontWeight: "500" }}
            >
              +
            </Texto>
          </Pressable>
        </View>

        {ABAS.slice(2).map((item) => (
          <ItemDeAba
            key={item.id}
            item={item}
            ativo={item.id === aba}
            alerta={item.id === "inicio" && sync.unresolved > 0}
            onPress={() => setAba(item.id)}
          />
        ))}
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


/**
 * Um destino da barra.
 *
 * Sem ícone, e isso é deliberado: quatro palavras curtas cabem e não deixam
 * dúvida, enquanto um ícone de "orçamento" ou de "ajustes" precisa ser
 * aprendido. O ponto do alerta fica ao lado do rótulo em vez de virar um selo
 * numerado — a informação útil é "tem algo esperando", não quantos.
 */
function ItemDeAba({
  item,
  ativo,
  alerta,
  onPress,
}: {
  item: { id: Aba; label: string };
  ativo: boolean;
  alerta: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 52,
        paddingVertical: space.sm,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Texto
          style={[
            type.bodySm,
            { color: ativo ? palette.accent : palette.inkSubtle, fontWeight: ativo ? "600" : "400" },
          ]}
        >
          {item.label}
        </Texto>
        {alerta ? (
          <View
            style={{ width: 5, height: 5, borderRadius: radius.pill, backgroundColor: palette.caution }}
          />
        ) : null}
      </View>

      {/* Sublinhado curto marca a aba ativa sem depender só da cor. */}
      <View
        style={{
          height: 2,
          width: 16,
          borderRadius: radius.pill,
          backgroundColor: ativo ? palette.accent : "transparent",
        }}
      />
    </Pressable>
  );
}
