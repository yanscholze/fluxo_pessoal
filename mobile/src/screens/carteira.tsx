/**
 * A carteira.
 *
 * Duas telas no mesmo lugar, ligadas por um gesto — é assim que a carteira do
 * telefone funciona, e é assim que a cabeça de quem usa já espera:
 *
 * **Fechada.** Uma pilha de cartões no meio da tela, o escolhido na frente e
 * os vizinhos um degrau atrás. Arrastar de lado troca. O motivo de não haver
 * mais nada aqui é o mesmo de a carteira física não ter: você abre para
 * escolher o cartão, e escolher é uma tarefa visual — cor, banco, bandeira.
 *
 * **Aberta.** Arrastar o cartão para cima o gira 90°, faz ele crescer 1,75
 * vezes e o manda para o alto da tela, onde sobra dele uma faixa larga
 * atravessada — como um cartão que volta para o bolso deixando a borda de
 * fora. O que estava atrás aparece: fatura, limite, comprometido, lançamentos.
 *
 * **Os números são do protótipo, não inventados aqui.** O giro de 90°, a
 * escala de 1,75, a faixa que sobra no alto, os 8px de degrau do vizinho, os
 * 0,28 de opacidade dele, os 600ms e a curva `cubic-bezier(.23,1,.32,1)` —
 * tudo medido no Figma Make e convertido pela régua de 440px de largura do
 * quadro dele. `REGUA` é essa conversão, e é o que faz o mesmo desenho caber
 * num telefone de qualquer largura.
 *
 * A pilha substituiu um trilho horizontal com `ScrollView`, e não por gosto: o
 * cartão aberto termina **acima** do lugar onde estava, fora dos limites do
 * pai, e todo `ScrollView` recorta o que passa da borda. Era isso que fazia a
 * animação sumir — o cartão subia e era cortado no caminho. Na pilha os
 * cartões vivem numa camada absoluta sobre a tela inteira, e não há borda
 * para cortar nada.
 *
 * O movimento roda no driver nativo, via Reanimated. Importa mais aqui do que
 * em qualquer outra tela: o gesto e a animação precisam acontecer no mesmo
 * quadro que o dedo, e a thread de JavaScript está justamente ocupada
 * derivando saldo quando a tela abre.
 */

import { useCallback, useMemo, useState } from "react";
import { Dimensions, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents } from "@fluxo/core/kernel/money.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import type { CardSummary } from "../finance/derive.ts";
import { useLedger } from "../state/ledger.tsx";
import { useConnectedSession } from "../state/session.tsx";
import { ALTURA_DA_FACE, CardFace, LARGURA_DA_FACE } from "../ui/card-face.tsx";
import { CardPhoto } from "../ui/card-photo.tsx";
import { Medidor } from "../ui/charts.tsx";
import { competence as formatCompetence, money, relativeDate } from "../ui/format.ts";
import { Body, Card, Empty, Label, Row, Small, Texto } from "../ui/primitives.tsx";
import { ScreenHeader } from "../ui/mockup.tsx";
import {
  CURVA,
  DURACAO,
  ESCALA_ABERTA,
  ESCALA_VIZINHA,
  GIRO_ABERTO,
  LIMIAR_HORIZONTAL,
  LIMIAR_VERTICAL,
  OPACIDADE_VIZINHA,
  deslocamentoDoCartao,
  geometriaDaCarteira,
} from "../ui/carteira-geometria.ts";
import { radius, space, type, usePalette } from "../ui/theme.ts";

const { width: LARGURA_DA_TELA, height: ALTURA_DA_TELA } = Dimensions.get("window");

/**
 * As medidas do protótipo moram em `carteira-geometria.ts`, fora do React.
 *
 * São a parte da animação que erra em silêncio — um cartão que para 40px acima
 * do lugar certo parece apenas "um pouco estranho" — e por isso são aritmética
 * pura, com teste próprio.
 */
const GEOMETRIA = geometriaDaCarteira(LARGURA_DA_TELA, ALTURA_DA_TELA);
const {
  palcoFechado: PALCO_FECHADO,
  palcoAberto: PALCO_ABERTO,
  degrauVizinho: DEGRAU_VIZINHO,
  pontosAbaixo: PONTOS_ABAIXO,
  pontosSobem: PONTOS_SOBEM,
  entradaDoPainel: ENTRADA_DO_PAINEL,
} = GEOMETRIA;

/** O tempo e a curva do protótipo: `0.6s cubic-bezier(.23,1,.32,1)`. */
const TEMPO = { duration: DURACAO, easing: Easing.bezier(...CURVA) } as const;

export function CarteiraScreen({
  onParcelamentos,
  onOpenTransaction,
  onAjustes,
}: {
  onParcelamentos: () => void;
  onOpenTransaction: (id: string) => void;
  onAjustes: () => void;
}) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const { overview, sync, synchronize } = useLedger();
  const [ativo, setAtivo] = useState(0);
  const [aberta, setAberta] = useState(false);
  /** Onde o palco começa. Só o layout sabe: depende do cabeçalho e da margem. */
  const [topoDoPalco, setTopoDoPalco] = useState(0);

  const hoje = todayIn();
  const cartoes = useMemo(() => overview?.cards ?? [], [overview]);
  const selecionado = cartoes[Math.min(ativo, Math.max(0, cartoes.length - 1))];

  /** 0 = carteira fechada, 1 = cartão recolhido e conteúdo à mostra. */
  const progresso = useSharedValue(0);

  /** Quanto o cartão sobe ao abrir. A conta está em `carteira-geometria.ts`. */
  const deslocamento = useMemo(
    () => deslocamentoDoCartao(GEOMETRIA, topoDoPalco, LARGURA_DA_FACE),
    [topoDoPalco],
  );

  const abrir = useCallback(() => {
    progresso.value = withTiming(1, TEMPO);
    setAberta(true);
  }, [progresso]);

  const fechar = useCallback(() => {
    progresso.value = withTiming(0, TEMPO);
    setAberta(false);
  }, [progresso]);

  const trocar = useCallback(
    (passo: number) => {
      setAtivo((atual) => Math.max(0, Math.min(atual + passo, cartoes.length - 1)));
    },
    [cartoes.length],
  );

  /*
   * A decisão é na soltura, como no protótipo.
   *
   * Ele lê `touchstart` e `touchend` e compara os dois pontos — não acompanha
   * o dedo no caminho. Seguir o dedo daria uma sensação melhor, e era o que
   * esta tela fazia antes; mas aí o movimento deixaria de ser o do desenho, e
   * a regra desta reforma é que o desenho manda.
   *
   * O eixo dominante decide o que o gesto significa: vertical abre ou fecha,
   * horizontal troca de cartão — e só com a carteira fechada, porque com ela
   * aberta há um cartão só em cena.
   */
  const montarGesto = useCallback(() => {
    const arrastar = Gesture.Pan().onEnd((evento) => {
      const dx = evento.translationX;
      const dy = evento.translationY;

      if (Math.abs(dy) > Math.abs(dx)) {
        if (dy < -LIMIAR_VERTICAL) runOnJS(abrir)();
        else if (dy > LIMIAR_VERTICAL) runOnJS(fechar)();
        return;
      }

      if (!aberta && Math.abs(dx) > LIMIAR_HORIZONTAL) runOnJS(trocar)(dx < 0 ? 1 : -1);
    });

    /*
     * O toque não está no protótipo — lá o cartão não responde a clique.
     * Continua aqui porque é o caminho de quem navega por toque assistido: um
     * arrasto de 30px é um gesto que nem todo mundo consegue fazer, e tirar a
     * única alternativa a ele fecharia a tela para essas pessoas.
     */
    const tocar = Gesture.Tap()
      .maxDuration(250)
      .onEnd((_evento, sucesso) => {
        if (sucesso) runOnJS(aberta ? fechar : abrir)();
      });

    return Gesture.Simultaneous(arrastar, tocar);
  }, [aberta, abrir, fechar, trocar]);

  /*
   * Dois detectores, e não um.
   *
   * No protótipo o ouvinte está na tela inteira: arrastar em qualquer lugar
   * troca ou abre. Aqui a tela inteira não serve — embaixo do palco mora o
   * painel de detalhes, que precisa rolar. Então o gesto cobre o cartão e a
   * área vazia em volta dele, que é onde o dedo de fato vai.
   *
   * Cada detector recebe uma instância própria: um objeto de gesto guarda a
   * identidade do manipulador nativo, e compartilhá-lo entre dois faria o
   * segundo roubar o registro do primeiro.
   */
  const gestoDoCartao = useMemo(() => montarGesto(), [montarGesto]);
  const gestoDoPalco = useMemo(() => montarGesto(), [montarGesto]);

  /** A face escolhida: sobe, tomba de lado e cresce, tudo no mesmo tempo. */
  const estiloDaFace = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progresso.value, [0, 1], [0, deslocamento], Extrapolation.CLAMP) },
      {
        rotate: `${interpolate(progresso.value, [0, 1], [0, GIRO_ABERTO], Extrapolation.CLAMP)}deg`,
      },
      { scale: interpolate(progresso.value, [0, 1], [1, ESCALA_ABERTA], Extrapolation.CLAMP) },
    ],
  }));

  /** O palco encolhe, e é o que abre espaço para o painel subir. */
  const estiloDoPalco = useAnimatedStyle(() => ({
    height: interpolate(
      progresso.value,
      [0, 1],
      [PALCO_FECHADO, PALCO_ABERTO],
      Extrapolation.CLAMP,
    ),
  }));

  /** Os pontos saem de cena subindo, como no protótipo. */
  const estiloDosPontos = useAnimatedStyle(() => ({
    opacity: interpolate(progresso.value, [0, 0.45], [1, 0], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(progresso.value, [0, 1], [0, -PONTOS_SOBEM], Extrapolation.CLAMP) },
    ],
  }));

  /** O conteúdo entra por baixo, atrasado em relação ao cartão. */
  const estiloDoConteudo = useAnimatedStyle(() => ({
    opacity: interpolate(progresso.value, [0.35, 1], [0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(
          progresso.value,
          [0, 1],
          [ENTRADA_DO_PAINEL, 0],
          Extrapolation.CLAMP,
        ),
      },
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

  /** A face, centrada no palco, antes de qualquer transformação. */
  const topoDaFace = topoDoPalco + PALCO_FECHADO / 2 - ALTURA_DA_FACE / 2;
  const esquerdaDaFace = (LARGURA_DA_TELA - LARGURA_DA_FACE) / 2;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        <ScreenHeader
          title="Cartões"
          subtitle={
            aberta ? "Arraste ↓ para fechar" : "Arraste ← → para trocar ou ↑ para ver detalhes"
          }
          onProfile={onAjustes}
          profileName={credentials.user.displayName}
        />
      </View>

      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: (LARGURA_DA_TELA - 420) / 2,
          top: -145,
          width: 420,
          height: 420,
          borderRadius: 210,
          backgroundColor: palette.accentWash,
          opacity: 0.68,
        }}
      />

      {/* O palco só reserva espaço; quem desenha o cartão é a camada de cima. */}
      <GestureDetector gesture={gestoDoPalco}>
        <Animated.View
          style={estiloDoPalco}
          onLayout={(evento) => {
            // A altura do palco é animada, e `onLayout` dispara a cada mudança
            // dela. O que interessa é só o topo, que não muda — sem a guarda,
            // seria um `setState` por quadro durante toda a animação.
            const { y } = evento.nativeEvent.layout;
            setTopoDoPalco((atual) => (Math.abs(atual - y) < 0.5 ? atual : y));
          }}
        />
      </GestureDetector>

      {/*
        Fechada, o conteúdo não pode interceptar toque: ele está invisível, mas
        continuaria capturando o arrasto que deveria ser do cartão.
        `pointerEvents` é propriedade da view, não de estilo animado — o
        Reanimated ignoraria em silêncio se fosse pelo `useAnimatedStyle`.
      */}
      <Animated.View
        pointerEvents={aberta ? "auto" : "none"}
        style={[{ flex: 1 }, estiloDoConteudo]}
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
          {selecionado ? (
            <Detalhe
              resumo={selecionado}
              hoje={hoje}
              aoFechar={fechar}
              aoAtualizar={() => void synchronize()}
              onOpenTransaction={onOpenTransaction}
              onParcelamentos={onParcelamentos}
            />
          ) : null}
        </ScrollView>
      </Animated.View>

      {/*
        A camada dos cartões, por cima de tudo e sem borda que recorte.

        `box-none` deixa o toque passar para o conteúdo onde não há cartão —
        sem isso a camada cobriria a tela inteira e o painel de detalhes
        deixaria de responder.
      */}
      <View
        pointerEvents="box-none"
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      >
        {cartoes.map((resumo, indice) => {
          const distancia = indice - ativo;
          // Só o escolhido e os vizinhos imediatos entram em cena; e, com a
          // carteira aberta, apenas o escolhido. É o recorte do protótipo.
          if (Math.abs(distancia) > 1) return null;
          if (aberta && distancia !== 0) return null;

          const ehOEscolhido = distancia === 0;

          return (
            <GestureDetector key={resumo.card.id} gesture={gestoDoCartao}>
              <Animated.View
                pointerEvents={ehOEscolhido ? "auto" : "none"}
                style={[
                  {
                    position: "absolute",
                    left: esquerdaDaFace,
                    top: topoDaFace,
                    zIndex: ehOEscolhido ? 10 : 1,
                  },
                  ehOEscolhido
                    ? estiloDaFace
                    : {
                        opacity: OPACIDADE_VIZINHA,
                        transform: [
                          { translateY: DEGRAU_VIZINHO * Math.abs(distancia) },
                          { scale: ESCALA_VIZINHA },
                        ],
                      },
                ]}
              >
                <CardFace
                  resumo={resumo}
                  hoje={hoje}
                  titular={credentials.user.displayName}
                  atenuada={!ehOEscolhido && cartoes.length > 1}
                />
              </Animated.View>
            </GestureDetector>
          );
        })}

        {/* Os pontos, abaixo do cartão, na posição que o protótipo usa. */}
        {cartoes.length > 1 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: 0,
                right: 0,
                top: topoDoPalco + PALCO_FECHADO / 2 + PONTOS_ABAIXO,
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
              },
              estiloDosPontos,
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
      </View>
    </SafeAreaView>
  );
}

function Detalhe({
  resumo,
  hoje,
  aoFechar,
  aoAtualizar,
  onOpenTransaction,
  onParcelamentos,
}: {
  resumo: CardSummary;
  hoje: string;
  aoFechar: () => void;
  aoAtualizar: () => void;
  onOpenTransaction: (id: string) => void;
  onParcelamentos: () => void;
}) {
  const palette = usePalette();
  const { transactions } = useLedger();
  const { card } = resumo;

  if (card.kind !== "credit") {
    return (
      <>
        <Card>
          <Label>{card.name}</Label>
          <Body muted style={{ marginTop: space.xs }}>
            Cartão de débito: cada compra sai direto do saldo da conta, sem fatura e sem limite próprio.
          </Body>
          <Pressable onPress={aoFechar} style={{ marginTop: space.md }}>
            <Small tone="muted">Voltar para a carteira</Small>
          </Pressable>
        </Card>
        <Pressable accessibilityRole="button" onPress={onParcelamentos} style={({ pressed }) => ({ minHeight: 58, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: pressed ? palette.surfaceRaised : palette.surface, borderWidth: 1, borderColor: palette.line, justifyContent: "center" })}>
          <Body strong>Parcelamentos</Body>
          <Small style={{ marginTop: 2 }}>Ver compras parceladas dos cartões</Small>
        </Pressable>
      </>
    );
  }

  const usado = card.limit > 0 ? card.limit - (resumo.available ?? 0) : 0;
  const fecha = resumo.daysToClosing;
  const lancamentosDaFatura = transactions.filter(
    (item) => item.cardId === card.id && item.competence === resumo.competence,
  );

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
        <Label>Lançamentos da fatura</Label>
        <View style={{ marginTop: space.sm }}>
          {lancamentosDaFatura.length ? lancamentosDaFatura.map((item) => (
            <Row key={item.id} onPress={() => onOpenTransaction(item.id)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Body numberOfLines={1}>{item.description}</Body>
                <Small>{relativeDate(item.occurredOn as never)}{item.installmentNumber ? ` · ${item.installmentNumber}ª parcela` : ""}</Small>
              </View>
              <Body strong>− {money(item.amount)}</Body>
            </Row>
          )) : <Empty title="Nenhum lançamento nesta fatura" />}
        </View>
      </Card>

      <Pressable accessibilityRole="button" onPress={onParcelamentos} style={({ pressed }) => ({ minHeight: 58, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: pressed ? palette.surfaceRaised : palette.surface, borderWidth: 1, borderColor: palette.line, justifyContent: "center" })}>
        <Body strong>Parcelamentos</Body>
        <Small style={{ marginTop: 2 }}>Ver compras parceladas deste e dos outros cartões</Small>
      </Pressable>

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
