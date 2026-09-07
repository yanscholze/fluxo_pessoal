/**
 * Casca do aplicativo: grupo embaixo, tela em cima.
 *
 * A estrutura é a mesma do site — classe e subclasse. Lá o menu lateral tem
 * sete títulos com seus itens dentro; aqui a barra de baixo escolhe o grupo e um
 * cartão no topo escolhe a tela dentro dele. É a mesma árvore, dobrada para
 * caber numa mão.
 *
 * Antes eram quatro abas planas, uma tela cada, e tudo o que não coubesse nelas
 * simplesmente não existia no aplicativo. Com dois níveis, dezoito telas cabem
 * em cinco destinos sem que nenhuma fique inalcançável.
 *
 * Continua sem biblioteca de navegação. O que uma resolveria — deep linking,
 * histórico entre abas, transições configuráveis — este aplicativo não usa.
 */

import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AjustesScreen } from "./screens/ajustes.tsx";
import { CapturasScreen } from "./screens/capturas.tsx";
import { CartoesScreen } from "./screens/cartoes.tsx";
import { ExtratoScreen } from "./screens/extrato.tsx";
import { InicioScreen } from "./screens/inicio.tsx";
import { LancamentoScreen } from "./screens/lancamento.tsx";
import {
  AutomacoesScreen,
  ContasScreen,
  InvestimentosScreen,
  MetasScreen,
  RecompensasScreen,
  ViagensScreen,
} from "./screens/listas.tsx";
import { OrcamentosScreen } from "./screens/orcamentos.tsx";
import { ParcelamentosScreen } from "./screens/parcelamentos.tsx";
import { PatrimonioScreen } from "./screens/patrimonio.tsx";
import { PlanejamentoScreen } from "./screens/planejamento.tsx";
import { RelatoriosScreen } from "./screens/relatorios.tsx";
import { SaudeScreen } from "./screens/saude.tsx";
import { TrabalhoScreen } from "./screens/trabalho.tsx";
import { useLedger } from "./state/ledger.tsx";
import { Texto } from "./ui/primitives.tsx";
import { elevation, radius, space, type, usePalette } from "./ui/theme.ts";

type Tela =
  | "painel"
  | "saude"
  | "relatorios"
  | "lancamentos"
  | "contas"
  | "cartoes"
  | "parcelamentos"
  | "recorrencias"
  | "orcamentos"
  | "metas"
  | "patrimonio"
  | "investimentos"
  | "recompensas"
  | "viagens"
  | "trabalho"
  | "automacoes"
  | "capturas"
  | "configuracoes";

type Grupo = {
  readonly id: string;
  readonly label: string;
  readonly telas: readonly { readonly id: Tela; readonly label: string }[];
};

/**
 * Os cinco grupos, espelhando as classes do site.
 *
 * O site tem sete títulos; aqui "Análise" entra em Início — relatório responde
 * a mesma pergunta que o painel, só com mais história — e "Trabalho" divide o
 * último grupo com o que o site chama de "Sistema".
 *
 * Automações saíram de dentro das configurações. Automação não é preferência de
 * aparência: é uma regra que mexe no dinheiro sozinha, e quem tem uma ativa
 * precisa alcançá-la sem caçar num menu de ajustes.
 */
const GRUPOS: readonly Grupo[] = [
  {
    id: "inicio",
    label: "Início",
    telas: [
      { id: "painel", label: "Painel" },
      { id: "saude", label: "Saúde" },
      { id: "relatorios", label: "Relatórios" },
    ],
  },
  {
    id: "movimento",
    label: "Movimento",
    telas: [
      { id: "lancamentos", label: "Lançamentos" },
      { id: "contas", label: "Contas" },
      { id: "cartoes", label: "Cartões" },
      { id: "parcelamentos", label: "Parcelamentos" },
    ],
  },
  {
    id: "planos",
    label: "Planos",
    telas: [
      { id: "recorrencias", label: "Recorrências" },
      { id: "orcamentos", label: "Orçamentos" },
      { id: "metas", label: "Metas" },
    ],
  },
  {
    id: "patrimonio",
    label: "Patrimônio",
    telas: [
      { id: "patrimonio", label: "Visão geral" },
      { id: "investimentos", label: "Investimentos" },
      { id: "recompensas", label: "Recompensas" },
      { id: "viagens", label: "Viagens" },
    ],
  },
  {
    id: "mais",
    label: "Mais",
    telas: [
      { id: "trabalho", label: "Trabalho" },
      { id: "automacoes", label: "Automações" },
      { id: "capturas", label: "Capturas" },
      { id: "configuracoes", label: "Ajustes" },
    ],
  },
];

export function Shell() {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { transactions, sync } = useLedger();

  const [grupoId, setGrupoId] = useState(GRUPOS[0].id);
  /**
   * A tela escolhida dentro de cada grupo.
   *
   * Guardada por grupo, e não uma só: voltar para "Movimento" depois de passar
   * por "Planos" devolve a pessoa a "Contas" se era ali que ela estava. Perder
   * isso faz cada troca de grupo parecer que o aplicativo recomeçou.
   */
  const [telaPorGrupo, setTelaPorGrupo] = useState<Record<string, Tela>>(
    Object.fromEntries(GRUPOS.map((grupo) => [grupo.id, grupo.telas[0].id])),
  );

  const [editando, setEditando] = useState<string | null>(null);
  const [folhaAberta, setFolhaAberta] = useState(false);

  const grupo = GRUPOS.find((candidato) => candidato.id === grupoId) ?? GRUPOS[0];
  const tela = telaPorGrupo[grupo.id] ?? grupo.telas[0].id;

  const emEdicao = useMemo(
    () => (editando ? (transactions.find((item) => item.id === editando) ?? null) : null),
    [editando, transactions],
  );

  function abrirLancamento(id: string | null) {
    setEditando(id);
    setFolhaAberta(true);
  }

  function irPara(destino: Tela) {
    const dono = GRUPOS.find((candidato) => candidato.telas.some((item) => item.id === destino));
    if (!dono) return;
    setGrupoId(dono.id);
    setTelaPorGrupo((atual) => ({ ...atual, [dono.id]: destino }));
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.canvas }}>
      <View style={{ flex: 1 }}>
        {/*
          O seletor só aparece quando há escolha a fazer.

          Um grupo de uma tela só ganharia um cartão que não faz nada — ruído
          ocupando o topo da tela mais valiosa do aplicativo.
        */}
        {grupo.telas.length > 1 ? (
          <SeletorDeTela
            grupo={grupo}
            ativa={tela}
            onEscolher={(destino) => setTelaPorGrupo((atual) => ({ ...atual, [grupo.id]: destino }))}
          />
        ) : null}

        <View style={{ flex: 1 }}>
          <Conteudo tela={tela} onAbrirLancamento={abrirLancamento} onIrPara={irPara} />
        </View>
      </View>

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
        {GRUPOS.map((item) => (
          <ItemDeGrupo
            key={item.id}
            label={item.label}
            ativo={item.id === grupo.id}
            alerta={item.id === "inicio" && sync.unresolved > 0}
            onPress={() => {
              // Tocar no grupo já ativo volta para a primeira tela dele — o
              // mesmo gesto de "voltar ao começo" que toda barra de abas tem.
              if (item.id === grupo.id) {
                setTelaPorGrupo((atual) => ({ ...atual, [item.id]: item.telas[0].id }));
              } else {
                setGrupoId(item.id);
              }
            }}
          />
        ))}
      </View>

      {/*
        A ação flutua acima da barra, à direita.

        Com cinco grupos ela não cabe mais no meio, que era onde ficava. À
        direita continua na zona natural do polegar e libera o quinto destino.
      */}
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
        onRequestClose={() => {
          setFolhaAberta(false);
          setEditando(null);
        }}
      >
        <LancamentoScreen
          existing={emEdicao}
          onClose={() => {
            setFolhaAberta(false);
            setEditando(null);
          }}
        />
      </Modal>
    </View>
  );
}

/** Resolve a tela escolhida. */
function Conteudo({
  tela,
  onAbrirLancamento,
  onIrPara,
}: {
  tela: Tela;
  onAbrirLancamento: (id: string | null) => void;
  onIrPara: (tela: Tela) => void;
}) {
  switch (tela) {
    case "painel":
      return <InicioScreen onOpenTransaction={onAbrirLancamento} onAbrirAjustes={() => onIrPara("configuracoes")} />;
    case "saude":
      return <SaudeScreen />;
    case "relatorios":
      return <RelatoriosScreen />;
    case "lancamentos":
      return <ExtratoScreen onOpenTransaction={onAbrirLancamento} />;
    case "contas":
      return <ContasScreen />;
    case "cartoes":
      return <CartoesScreen />;
    case "parcelamentos":
      return <ParcelamentosScreen />;
    case "recorrencias":
      return <PlanejamentoScreen />;
    case "orcamentos":
      return <OrcamentosScreen />;
    case "metas":
      return <MetasScreen />;
    case "patrimonio":
      return <PatrimonioScreen />;
    case "investimentos":
      return <InvestimentosScreen />;
    case "recompensas":
      return <RecompensasScreen />;
    case "viagens":
      return <ViagensScreen />;
    case "trabalho":
      return <TrabalhoScreen />;
    case "automacoes":
      return <AutomacoesScreen />;
    case "capturas":
      return <CapturasScreen onVoltar={() => onIrPara("painel")} />;
    case "configuracoes":
      return <AjustesScreen onAbrirCapturas={() => onIrPara("capturas")} onVoltar={() => onIrPara("painel")} />;
  }
}

/**
 * O cartão que escolhe a tela dentro do grupo.
 *
 * Rola na horizontal porque o grupo maior tem quatro itens e um deles seria
 * cortado num aparelho estreito — e item cortado é item que não existe. A pilha
 * de rolagem começa alinhada à esquerda para que o primeiro, que é o mais usado,
 * esteja sempre visível.
 */
function SeletorDeTela({
  grupo,
  ativa,
  onEscolher,
}: {
  grupo: Grupo;
  ativa: Tela;
  onEscolher: (tela: Tela) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + space.sm,
        paddingBottom: space.sm,
        backgroundColor: palette.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: palette.line,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.lg, gap: 6 }}
      >
        {grupo.telas.map((item) => {
          const selecionada = item.id === ativa;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: selecionada }}
              onPress={() => onEscolher(item.id)}
              style={{
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
                borderRadius: radius.pill,
                backgroundColor: selecionada ? palette.accent : palette.surfaceSunken,
              }}
            >
              <Texto
                style={[
                  type.bodySm,
                  {
                    color: selecionada ? palette.accentInk : palette.inkMuted,
                    fontWeight: selecionada ? "600" : "400",
                  },
                ]}
              >
                {item.label}
              </Texto>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * Um grupo da barra de baixo.
 *
 * Sem ícone: cinco palavras curtas cabem e não deixam dúvida, enquanto um ícone
 * de "planos" ou de "mais" precisa ser aprendido. O ponto do alerta fica ao lado
 * do rótulo em vez de virar selo numerado — a informação útil é "tem algo
 * esperando", não quantos.
 */
function ItemDeGrupo({
  label,
  ativo,
  alerta,
  onPress,
}: {
  label: string;
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
          {label}
        </Texto>
        {alerta ? (
          <View style={{ width: 5, height: 5, borderRadius: radius.pill, backgroundColor: palette.caution }} />
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
