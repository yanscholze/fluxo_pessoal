/**
 * A carteira.
 *
 * Duas telas no mesmo lugar, ligadas por um gesto — é assim que a carteira do
 * telefone funciona, e é assim que a cabeça de quem usa já espera:
 *
 * **Fechada.** Só os cartões. Nada de número, nada de cabeçalho, nada de
 * rodapé. Arrastar de lado troca o cartão da frente. O motivo de não haver mais
 * nada aqui é o mesmo de a carteira física não ter: você abre para escolher o
 * cartão, e escolher é uma tarefa visual — cor, banco, bandeira. Texto ao redor
 * só atrapalha o reconhecimento.
 *
 * **Aberta.** Tocar no cartão, ou arrastá-lo para cima, gira a face 90° no eixo
 * X: ela tomba para longe e se recolhe no alto da tela, como um cartão que
 * volta para o bolso. O que estava atrás dele aparece — fatura, limite,
 * comprometido, lançamentos, gráfico.
 *
 * A rotação não é enfeite. Ela responde "para onde foi o cartão": sem o giro,
 * a face sumiria e o conteúdo apareceria, e ninguém saberia como voltar. Com
 * ele, o cartão continua visível, deitado no topo, dizendo onde está e que dá
 * para puxá-lo de volta.
 *
 * O movimento inteiro roda no driver nativo, via Reanimated. Isso importa mais
 * aqui do que em qualquer outra tela do aplicativo: o gesto e a animação
 * precisam acontecer no mesmo quadro que o dedo, e a thread de JavaScript está
 * justamente ocupada derivando saldo quando a tela abre.
 */

import { useCallback, useMemo, useState } from "react";
import { Dimensions, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents } from "@fluxo/core/kernel/money.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import type { CardSummary } from "../finance/derive.ts";
import { useLedger } from "../state/ledger.tsx";
import { CardFace, LARGURA_DA_FACE } from "../ui/card-face.tsx";
import { CardPhoto } from "../ui/card-photo.tsx";
import { Medidor } from "../ui/charts.tsx";
import { competence as formatCompetence, money, relativeDate } from "../ui/format.ts";
import { Body, Card, Empty, Label, Row, Small, Texto } from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

const { width: LARGURA_DA_TELA } = Dimensions.get("window");
const ESPACO = space.md;
const PASSO = LARGURA_DA_FACE + ESPACO;
/** Sobra de cada lado para o cartão da frente ficar centrado no trilho. */
const MARGEM = (LARGURA_DA_TELA - LARGURA_DA_FACE) / 2;

/**
 * Quanto o cartão sobe ao abrir.
 *
 * Não é a altura da face: ele gira enquanto sobe, e uma face tombada ocupa
 * quase nada de altura. Subir demais o faria sair da tela; subir de menos
 * deixaria uma faixa morta entre ele e o conteúdo.
 */
const ALTURA_RECOLHIDA = 132;

/** Arrasto vertical que completa a abertura sozinho, mesmo sem velocidade. */
const LIMIAR = 90;

/** Mola única para toda a tela: dois tempos diferentes leriam como dois eventos. */
const MOLA = { damping: 18, stiffness: 190, mass: 0.9 } as const;

export function CarteiraScreen() {
  const palette = usePalette();
  const { overview, sync, synchronize } = useLedger();
  const [ativo, setAtivo] = useState(0);
  const [aberta, setAberta] = useState(false);

  const hoje = todayIn();
  const cartoes = useMemo(() => overview?.cards ?? [], [overview]);
  const selecionado = cartoes[Math.min(ativo, Math.max(0, cartoes.length - 1))];

  /** 0 = carteira fechada, 1 = cartão recolhido e conteúdo à mostra. */
  const progresso = useSharedValue(0);

  const marcarAberta = useCallback((valor: boolean) => setAberta(valor), []);

  const abrir = useCallback(() => {
    progresso.value = withSpring(1, MOLA);
    setAberta(true);
  }, [progresso]);

  const fechar = useCallback(() => {
    progresso.value = withSpring(0, MOLA);
    setAberta(false);
  }, [progresso]);

  /*
   * O arrasto vertical dirige a animação em vez de disparar uma.
   *
   * Enquanto o dedo está na tela, `progresso` acompanha a distância: o cartão
   * gira junto do movimento e a decisão fica com quem arrasta. Só ao soltar
   * entra a mola, e a direção vem da velocidade — um empurrão rápido completa
   * o gesto mesmo sem ter percorrido a distância toda, que é como todo painel
   * arrastável do sistema se comporta.
   */
  const arrastar = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .failOffsetX([-18, 18])
    .onUpdate((evento) => {
      const base = aberta ? 1 : 0;
      progresso.value = Math.min(1, Math.max(0, base - evento.translationY / LIMIAR / 2));
    })
    .onEnd((evento) => {
      const rapido = Math.abs(evento.velocityY) > 500;
      const paraCima = evento.velocityY < 0;
      const alvo = rapido ? (paraCima ? 1 : 0) : progresso.value > 0.5 ? 1 : 0;
      progresso.value = withSpring(alvo, MOLA);
      runOnJS(marcarAberta)(alvo === 1);
    });

  const tocar = Gesture.Tap()
    .maxDuration(250)
    .onEnd((_evento, sucesso) => {
      if (sucesso) runOnJS(aberta ? fechar : abrir)();
    });

  const gesto = Gesture.Simultaneous(arrastar, tocar);

  /** A face que se move: sobe, tomba e encolhe, tudo no mesmo tempo. */
  const estiloDaFace = useAnimatedStyle(() => ({
    transform: [
      // A perspectiva precisa vir antes da rotação, senão o giro fica chapado
      // e lê como o cartão encolhendo em vez de tombar.
      { perspective: 900 },
      {
        translateY: interpolate(progresso.value, [0, 1], [0, -ALTURA_RECOLHIDA], Extrapolation.CLAMP),
      },
      {
        rotateX: `${interpolate(progresso.value, [0, 1], [0, -78], Extrapolation.CLAMP)}deg`,
      },
      { scale: interpolate(progresso.value, [0, 1], [1, 0.82], Extrapolation.CLAMP) },
    ],
  }));

  /** As faces vizinhas somem ao abrir: só o escolhido continua em cena. */
  const estiloDosVizinhos = useAnimatedStyle(() => ({
    opacity: interpolate(progresso.value, [0, 0.4], [1, 0], Extrapolation.CLAMP),
  }));

  /** O conteúdo entra por baixo, atrasado em relação ao cartão. */
  const estiloDoConteudo = useAnimatedStyle(() => ({
    opacity: interpolate(progresso.value, [0.35, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(progresso.value, [0, 1], [28, 0], Extrapolation.CLAMP) },
    ],
  }));

  if (cartoes.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={[]}>
        <View style={{ padding: space.lg, flex: 1, justifyContent: "center" }}>
          <Card>
            <Empty
              title="Nenhum cartão cadastrado"
              hint="Cadastre um cartão no site para acompanhar competência, fatura e limite aqui."
            />
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <GestureDetector gesture={gesto}>
        <Animated.View style={{ paddingTop: space.xl }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={PASSO}
            decelerationRate="fast"
            scrollEnabled={!aberta}
            onMomentumScrollEnd={(evento) => {
              const indice = Math.round(evento.nativeEvent.contentOffset.x / PASSO);
              setAtivo(Math.max(0, Math.min(indice, cartoes.length - 1)));
            }}
            contentContainerStyle={{ paddingHorizontal: MARGEM, gap: ESPACO }}
          >
            {cartoes.map((resumo, indice) => {
              const ehOEscolhido = indice === ativo;
              return (
                <Animated.View
                  key={resumo.card.id}
                  style={ehOEscolhido ? estiloDaFace : estiloDosVizinhos}
                >
                  <CardFace resumo={resumo} hoje={hoje} atenuada={!ehOEscolhido && cartoes.length > 1} />
                </Animated.View>
              );
            })}
          </ScrollView>

          {/*
            O indicador some ao abrir junto com as faces vizinhas: com um cartão
            só em cena, ele deixa de dizer qualquer coisa.
          */}
          {cartoes.length > 1 ? (
            <Animated.View
              style={[
                { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: space.lg },
                estiloDosVizinhos,
              ]}
            >
              {cartoes.map((resumo, indice) => (
                <View
                  key={resumo.card.id}
                  style={{
                    height: 6,
                    width: indice === ativo ? 20 : 6,
                    borderRadius: radius.pill,
                    backgroundColor: indice === ativo ? palette.accent : palette.lineStrong,
                  }}
                />
              ))}
            </Animated.View>
          ) : null}

          {/*
            A dica aparece só com a carteira fechada, e some assim que o gesto
            começa: um rótulo que explica o gesto perde a função no instante em
            que ele é aprendido.
          */}
          <Animated.View style={[{ alignItems: "center", marginTop: space.md }, estiloDosVizinhos]}>
            <Small tone="subtle">Toque ou arraste para cima</Small>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/*
        Fechada, o conteúdo não pode interceptar toque: ele está invisível, mas
        continuaria capturando o arrasto que deveria ser do cartão.
        `pointerEvents` é propriedade da view, não de estilo animado — o
        Reanimated ignoraria em silêncio se fosse pelo `useAnimatedStyle`.
      */}
      <Animated.View
        pointerEvents={aberta ? "auto" : "none"}
        style={[{ flex: 1, marginTop: -ALTURA_RECOLHIDA + space.xl }, estiloDoConteudo]}
      >
        <ScrollView
          contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, gap: space.md }}
          refreshControl={
            <RefreshControl
              refreshing={sync.running}
              onRefresh={() => void synchronize()}
              tintColor={palette.accent}
            />
          }
        >
          {selecionado ? <Detalhe
              resumo={selecionado}
              hoje={hoje}
              aoFechar={fechar}
              aoAtualizar={() => void synchronize()}
            /> : null}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

function Detalhe({
  resumo,
  hoje,
  aoFechar,
  aoAtualizar,
}: {
  resumo: CardSummary;
  hoje: string;
  aoFechar: () => void;
  aoAtualizar: () => void;
}) {
  const palette = usePalette();
  const { card } = resumo;

  if (card.kind !== "credit") {
    return (
      <Card>
        <Label>{card.name}</Label>
        <Body muted style={{ marginTop: space.xs }}>
          Cartão de débito: cada compra sai direto do saldo da conta, sem fatura e sem limite
          próprio.
        </Body>
        <Pressable onPress={aoFechar} style={{ marginTop: space.md }}>
          <Small tone="muted">Voltar para a carteira</Small>
        </Pressable>
      </Card>
    );
  }

  const usado = card.limit > 0 ? card.limit - (resumo.available ?? 0) : 0;
  const fecha = resumo.daysToClosing;

  return (
    <>
      <Card>
        <Label>Fatura de {formatCompetence(resumo.competence)}</Label>
        <Texto style={[type.figure, { color: palette.ink, marginTop: space.xs }]}>
          {money(resumo.outstanding)}
        </Texto>
        {resumo.payments > 0 ? (
          <Small style={{ marginTop: 2 }}>
            {money(resumo.payments)} pagos de {money(resumo.charges)}
          </Small>
        ) : null}

        <View style={{ marginTop: space.md }}>
          <Row>
            <Body muted>Fecha</Body>
            <Body strong>{fecha >= 0 ? `em ${fecha} dia${fecha === 1 ? "" : "s"}` : "já fechou"}</Body>
          </Row>
          <Row style={{ borderBottomWidth: 0 }}>
            <Body muted>Vence</Body>
            <Body strong>{relativeDate(resumo.dueDate, hoje as never)}</Body>
          </Row>
        </View>
      </Card>

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Label>Limite comprometido</Label>
          <Small tone="muted">
            {money(cents(usado))} de {money(cents(card.limit))}
          </Small>
        </View>
        <View style={{ marginTop: space.sm }}>
          <Medidor
            valor={usado}
            total={Math.max(1, card.limit)}
            tom={usado / Math.max(1, card.limit) > 0.8 ? "negative" : "accent"}
          />
        </View>
        <Small style={{ marginTop: space.xs }}>
          {money(cents(resumo.available ?? 0))} livres · inclui parcelas futuras
        </Small>
      </Card>

      <Card>
        <Label style={{ marginBottom: space.sm }}>Face do cartão</Label>
        {/*
          A troca de foto vive aqui, e não nos ajustes: é olhando a face que se
          repara que ela está errada. No celular ainda ganha a câmera — o cartão
          está na mesma mão que o telefone.
        */}
        <CardPhoto cardId={card.id} aoTrocar={aoAtualizar} />
      </Card>

      <Pressable onPress={aoFechar} style={{ alignItems: "center", paddingVertical: space.md }}>
        <Small tone="muted">Arraste para baixo ou toque aqui para voltar</Small>
      </Pressable>
    </>
  );
}
