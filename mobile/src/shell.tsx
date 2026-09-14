/**
 * Casca do aplicativo: grupo embaixo, tela em cima.
 *
 * A estrutura é a mesma do site — classe e subclasse. Lá o menu lateral tem
 * sete títulos com seus itens dentro; aqui a barra de baixo escolhe o grupo e um
 * cartão no topo escolhe a tela dentro dele. É a mesma árvore, dobrada para
 * caber numa mão.
 *
 * A navegação conserva as implementações existentes, mas junta páginas que são
 * partes da mesma decisão financeira. A barra leva aos cinco contextos e o
 * seletor superior revela as derivações sem inflar a navegação principal.
 *
 * Continua sem biblioteca de navegação. O que uma resolveria — deep linking,
 * histórico entre abas, transições configuráveis — este aplicativo não usa.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { familiaDoPeso } from "./ui/fonts.ts";

import { AjustesScreen } from "./screens/ajustes.tsx";
import { CapturasScreen } from "./screens/capturas.tsx";
import { CarteiraScreen } from "./screens/carteira.tsx";
import { ExtratoScreen } from "./screens/extrato.tsx";
import { ImportarScreen } from "./screens/importar.tsx";
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
import { AssinaturasScreen } from "./screens/assinaturas.tsx";
import { AssistenteScreen } from "./screens/assistente.tsx";
import { AvisosScreen } from "./screens/avisos.tsx";
import { SaudeScreen } from "./screens/saude.tsx";
import { TrabalhoScreen } from "./screens/trabalho.tsx";
import { useLedger } from "./state/ledger.tsx";
import { Texto } from "./ui/primitives.tsx";
import { elevation, radius, space, type, usePalette } from "./ui/theme.ts";

type Tela =
  | "painel"
  | "avisos"
  | "saude"
  | "relatorios"
  | "lancamentos"
  | "contas"
  | "cartoes"
  | "parcelamentos"
  | "recorrencias"
  | "assinaturas"
  | "orcamentos"
  | "metas"
  | "patrimonio"
  | "investimentos"
  | "recompensas"
  | "viagens"
  | "trabalho"
  | "assistente"
  | "automacoes"
  | "capturas"
  | "importar"
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
    label: "Painel",
    telas: [
      { id: "painel", label: "Painel" },
      { id: "assistente", label: "TARS" },
      { id: "avisos", label: "Pendências" },
      { id: "relatorios", label: "Relatórios" },
    ],
  },
  {
    id: "movimento",
    label: "Movimento",
    telas: [
      { id: "lancamentos", label: "Lançamentos" },
      { id: "contas", label: "Contas" },
      { id: "cartoes", label: "Cartões e faturas" },
      { id: "parcelamentos", label: "Parcelamentos" },
      { id: "recorrencias", label: "Recorrências" },
      { id: "assinaturas", label: "Assinaturas" },
    ],
  },
  {
    id: "planos",
    label: "Planejar",
    telas: [
      { id: "orcamentos", label: "Orçamentos" },
      { id: "metas", label: "Metas" },
      { id: "viagens", label: "Viagens" },
    ],
  },
  {
    id: "patrimonio",
    label: "Visão geral",
    telas: [
      { id: "patrimonio", label: "Patrimônio" },
      { id: "investimentos", label: "Investimentos" },
      { id: "recompensas", label: "Recompensas" },
    ],
  },
  {
    id: "mais",
    label: "Mais",
    telas: [
      { id: "trabalho", label: "Trabalho" },
      { id: "automacoes", label: "Automações" },
      { id: "capturas", label: "Capturas e importações" },
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

      {/*
        A barra é o único controle sempre visível, e era a menor coisa da tela.
        Com cinco destinos em 52 px de altura e texto de legenda, cada alvo
        ficava no limite do que um polegar acerta sem olhar — e acertar sem
        olhar é exatamente o que se espera de uma barra de abas.
      */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "stretch",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: palette.line,
          backgroundColor: palette.surface,
          paddingTop: 6,
          paddingHorizontal: space.xs,
          paddingBottom: insets.bottom + 6,
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
          // Acima da barra, que agora mede 64 de item mais 12 de respiro. O
          // número acompanha a barra: separá-los faria o botão encostar nela na
          // primeira vez que a altura mudasse de novo.
          bottom: insets.bottom + 88,
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
    case "avisos":
      return <AvisosScreen onVoltar={() => onIrPara("painel")} />;
    case "assinaturas":
      return <AssinaturasScreen onVoltar={() => onIrPara("recorrencias")} />;
    case "assistente":
      return <AssistenteScreen onVoltar={() => onIrPara("trabalho")} />;
    case "saude":
      return <SaudeScreen />;
    case "relatorios":
      return <RelatoriosScreen />;
    case "lancamentos":
      return <ExtratoScreen onOpenTransaction={onAbrirLancamento} />;
    case "contas":
      return <ContasScreen />;
    case "cartoes":
      return <CarteiraScreen />;
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
    case "importar":
      return <ImportarScreen onVoltar={() => onIrPara("painel")} />;
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

  /*
   * A seleção é animada, e não trocada de um quadro para o outro.
   *
   * Numa barra de abas o movimento não é enfeite: ele diz **de onde para onde**
   * a navegação foi, e é o que faz a troca parecer um lugar mudando em vez de
   * uma tela sendo substituída. Sem isso, tocar numa aba dá a mesma sensação de
   * recarregar a página.
   *
   * `useNativeDriver` porque opacidade e escala rodam na thread de UI: a
   * animação continua fluida mesmo enquanto a tela nova busca dados, que é
   * justamente quando a thread de JavaScript está ocupada.
   */
  const progresso = useRef(new Animated.Value(ativo ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progresso, {
      toValue: ativo ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [ativo, progresso]);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: ativo }}
      onPress={onPress}
      // O alvo passa a ocupar a altura inteira do item: um toque perto da borda
      // de cima deixava de contar, e ninguém entende por que a aba não trocou.
      style={({ pressed }) => ({
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 64,
        paddingVertical: space.sm,
        gap: 5,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <Animated.Text
          numberOfLines={1}
          style={[
            type.bodySm,
            {
              fontFamily: familiaDoPeso(ativo ? "600" : "400"),
              color: ativo ? palette.accent : palette.inkMuted,
              transform: [
                {
                  translateY: progresso.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                },
              ],
            },
          ]}
        >
          {label}
        </Animated.Text>
        {alerta ? (
          <View style={{ width: 6, height: 6, borderRadius: radius.pill, backgroundColor: palette.caution }} />
        ) : null}
      </View>

      {/*
        O traço cresce a partir do centro em vez de aparecer pronto. É o que
        amarra o movimento ao toque: a mão saiu daqui, e a marca segue.
      */}
      <Animated.View
        style={{
          height: 3,
          width: 22,
          borderRadius: radius.pill,
          backgroundColor: palette.accent,
          opacity: progresso,
          transform: [{ scaleX: progresso }],
        }}
      />
    </Pressable>
  );
}
