/**
 * Casca do aplicativo: cinco abas, uma pilha por aba, e a folha de lançamento.
 *
 * A navegação continua escrita à mão. O que mudou foi a forma: antes era um
 * `useState` com um único valor de aba, o que bastava para quatro telas e
 * quebrava na quinta — não havia como abrir "Patrimônio" a partir de "Carteira"
 * e voltar para onde se estava.
 *
 * Agora cada aba tem sua própria pilha. Trocar de aba preserva onde você estava
 * dentro dela, que é o comportamento que todo aplicativo de celular tem e cuja
 * ausência se sente como perda de trabalho.
 *
 * Continua sem biblioteca de navegação: o que uma resolveria aqui — deep
 * linking, transições configuráveis, histórico entre abas — este aplicativo não
 * usa. Trocar isso por três dependências seria peso sem retorno.
 */

import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cents } from "@fluxo/core/kernel/money.ts";
import { AjustesScreen } from "./screens/ajustes.tsx";
import { CapturasScreen } from "./screens/capturas.tsx";
import { CartoesScreen } from "./screens/cartoes.tsx";
import { ExtratoScreen } from "./screens/extrato.tsx";
import { HubScreen, ResumoDoHub } from "./screens/hub.tsx";
import { InicioScreen } from "./screens/inicio.tsx";
import { LancamentoScreen } from "./screens/lancamento.tsx";
import { OrcamentosScreen } from "./screens/orcamentos.tsx";
import { ParcelamentosScreen } from "./screens/parcelamentos.tsx";
import { PatrimonioScreen } from "./screens/patrimonio.tsx";
import { PlanejamentoScreen } from "./screens/planejamento.tsx";
import { RelatoriosScreen } from "./screens/relatorios.tsx";
import { SaudeScreen } from "./screens/saude.tsx";
import { TrabalhoScreen } from "./screens/trabalho.tsx";
import { useLedger } from "./state/ledger.tsx";
import { Figure, Small, Texto } from "./ui/primitives.tsx";
import { money } from "./ui/format.ts";
import { elevation, radius, space, type, usePalette } from "./ui/theme.ts";

type Aba = "inicio" | "extrato" | "carteira" | "planos" | "trabalho";

/** Toda tela que pode ser empilhada sobre uma aba. */
type Rota =
  | "saude"
  | "relatorios"
  | "ajustes"
  | "capturas"
  | "cartoes"
  | "patrimonio"
  | "parcelamentos"
  | "orcamentos"
  | "planejamento";

/**
 * Cinco destinos, um por pergunta.
 *
 * "Praticamente tudo o que o desktop tem" não significa vinte abas: significa
 * que nada do desktop fica inalcançável. As vinte e nove rotas do site cabem em
 * cinco perguntas, e o resto vive empilhado atrás delas.
 */
const ABAS: readonly { readonly id: Aba; readonly label: string }[] = [
  { id: "inicio", label: "Início" },
  { id: "extrato", label: "Extrato" },
  { id: "carteira", label: "Carteira" },
  { id: "planos", label: "Planos" },
  { id: "trabalho", label: "Trabalho" },
];

export function Shell() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { transactions, sync, overview } = useLedger();

  const [aba, setAba] = useState<Aba>("inicio");
  const [pilhas, setPilhas] = useState<Record<Aba, Rota[]>>({
    inicio: [],
    extrato: [],
    carteira: [],
    planos: [],
    trabalho: [],
  });

  const [editando, setEditando] = useState<string | null>(null);
  const [folhaAberta, setFolhaAberta] = useState(false);

  const emEdicao = useMemo(
    () => (editando ? (transactions.find((item) => item.id === editando) ?? null) : null),
    [editando, transactions],
  );

  const empilhar = useCallback(
    (rota: Rota) => setPilhas((atual) => ({ ...atual, [aba]: [...atual[aba], rota] })),
    [aba],
  );

  const desempilhar = useCallback(
    () => setPilhas((atual) => ({ ...atual, [aba]: atual[aba].slice(0, -1) })),
    [aba],
  );

  function abrirLancamento(id: string | null) {
    setEditando(id);
    setFolhaAberta(true);
  }

  function fecharLancamento() {
    setFolhaAberta(false);
    setEditando(null);
  }

  const topo = pilhas[aba].at(-1) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
      <View style={{ flex: 1 }}>
        {topo ? (
          <Empilhada rota={topo} onVoltar={desempilhar} onAbrir={empilhar} />
        ) : aba === "inicio" ? (
          <InicioScreen
            onOpenTransaction={abrirLancamento}
            onAbrirAjustes={() => empilhar("ajustes")}
          />
        ) : aba === "extrato" ? (
          <ExtratoScreen onOpenTransaction={abrirLancamento} />
        ) : aba === "carteira" ? (
          <HubScreen
            titulo="Carteira"
            descricao="Quanto tenho e quanto devo."
            onAbrir={(id) => empilhar(id as Rota)}
            resumo={
              <ResumoDoHub rotulo="Em conta">
                <Figure>{money(overview?.balance ?? cents(0))}</Figure>
                <Small style={{ marginTop: 2 }}>
                  {money(overview?.committed ?? cents(0))} já com dono no cartão
                </Small>
              </ResumoDoHub>
            }
            destinos={[
              { id: "cartoes", titulo: "Cartões", descricao: "Fatura do mês, limite e o que vem depois." },
              { id: "parcelamentos", titulo: "Parcelamentos", descricao: "O que já foi comprado e ainda chega." },
              { id: "patrimonio", titulo: "Patrimônio", descricao: "O que sobra depois de tirar o que se deve." },
              { id: "saude", titulo: "Saúde financeira", descricao: "O diagnóstico, não o saldo." },
            ]}
          />
        ) : aba === "planos" ? (
          <HubScreen
            titulo="Planos"
            descricao="O que você combinou consigo mesmo."
            onAbrir={(id) => empilhar(id as Rota)}
            destinos={[
              { id: "orcamentos", titulo: "Orçamento", descricao: "Quanto ainda dá para gastar em cada coisa." },
              { id: "planejamento", titulo: "Recorrências e assinaturas", descricao: "O que se repete todo mês." },
              { id: "relatorios", titulo: "Relatórios", descricao: "Para onde o dinheiro foi." },
            ]}
          />
        ) : (
          <TrabalhoScreen />
        )}
      </View>

      {/*
        A barra: cinco destinos e a ação flutuando acima, à direita.

        Com número ímpar de abas o botão não cabe mais no meio da barra, que era
        onde ficava. À direita ele continua na zona natural do polegar e libera o
        quinto destino — que é o que faltava para a área de trabalho existir aqui.
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
        {ABAS.map((item) => (
          <ItemDeAba
            key={item.id}
            item={item}
            ativo={item.id === aba}
            alerta={item.id === "inicio" && sync.unresolved > 0}
            onPress={() => {
              // Tocar na aba já ativa volta para a raiz dela: é o gesto que todo
              // aplicativo tem e o único jeito de sair de uma pilha funda sem
              // apertar "voltar" várias vezes.
              if (item.id === aba) setPilhas((atual) => ({ ...atual, [aba]: [] }));
              else setAba(item.id);
            }}
          />
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Novo lançamento"
        onPress={() => abrirLancamento(null)}
        style={({ pressed }) => ({
          position: "absolute",
          right: space.lg,
          bottom: insets.bottom + 64,
          width: 56,
          height: 56,
          borderRadius: radius.pill,
          backgroundColor: palette.accent,
          alignItems: "center",
          justifyContent: "center",
          transform: [{ scale: pressed ? 0.94 : 1 }],
          ...elevation.float,
        })}
      >
        <Texto style={{ color: palette.accentInk, fontSize: 28, lineHeight: 32, fontWeight: "500" }}>+</Texto>
      </Pressable>

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

/** Resolve a tela que está no topo da pilha da aba corrente. */
function Empilhada({
  rota,
  onVoltar,
  onAbrir,
}: {
  rota: Rota;
  onVoltar: () => void;
  onAbrir: (rota: Rota) => void;
}) {
  switch (rota) {
    case "saude":
      return <SaudeScreen onVoltar={onVoltar} />;
    case "relatorios":
      return <RelatoriosScreen onVoltar={onVoltar} />;
    case "patrimonio":
      return <PatrimonioScreen onVoltar={onVoltar} />;
    case "parcelamentos":
      return <ParcelamentosScreen onVoltar={onVoltar} />;
    case "planejamento":
      return <PlanejamentoScreen onVoltar={onVoltar} />;
    case "cartoes":
      return <CartoesScreen />;
    case "orcamentos":
      return <OrcamentosScreen />;
    case "capturas":
      return <CapturasScreen onVoltar={onVoltar} />;
    case "ajustes":
      return <AjustesScreen onAbrirCapturas={() => onAbrir("capturas")} onVoltar={onVoltar} />;
  }
}

/**
 * Um destino da barra.
 *
 * Sem ícone, e isso continua deliberado: cinco palavras curtas cabem e não
 * deixam dúvida, enquanto um ícone de "planos" ou de "carteira" precisa ser
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
            type.caption,
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
