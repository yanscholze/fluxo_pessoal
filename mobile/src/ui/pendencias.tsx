/**
 * As pendências, no painel.
 *
 * Ficavam no fim da tela de Trabalho, atrás da lista de projetos — e a pergunta
 * que elas respondem é a primeira do dia, não a última. Aqui elas abrem o
 * aplicativo junto com a folga do mês.
 *
 * **A etapa muda arrastando o cartão.** O quadro de cinco colunas do site não
 * cabe num telefone: cinco colunas em 390 px dão 70 px cada, que não sustentam
 * um título. O que sobrevive da ideia é o gesto — o cartão anda para o lado e
 * muda de etapa, com o destino aparecendo atrás dele enquanto o dedo empurra.
 * Para a direita avança, para a esquerda volta, na mesma ordem do site.
 *
 * O cartão muda de etapa **antes** da resposta do servidor, e volta sozinho se
 * ela não vier. Esperar a rede com o dedo ainda na tela faria o gesto parecer
 * ignorado, que é o defeito que este tipo de interação não pode ter.
 */

import { useMemo, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { call } from "../net/client.ts";
import type { BoardTask } from "../net/views.ts";
import { useConnectedSession } from "../state/session.tsx";
import { relativeDate } from "./format.ts";
import { Body, Card, Label, Notice, Small } from "./primitives.tsx";
import { radius, space, usePalette } from "./theme.ts";

/** As etapas, na ordem em que o trabalho caminha. A mesma do site. */
const ETAPAS = [
  { id: "todo", label: "A fazer" },
  { id: "doing", label: "Fazendo" },
  { id: "blocked", label: "Travado" },
  { id: "review", label: "Revisão" },
  { id: "done", label: "Feito" },
] as const;

type Etapa = (typeof ETAPAS)[number]["id"];

const ROTULO = new Map<string, string>(ETAPAS.map((etapa) => [etapa.id, etapa.label]));

/** Quanto o cartão precisa andar para a etapa mudar ao soltar. */
const LIMIAR = 96;
/** Empurrão rápido conta mesmo sem percorrer a distância toda. */
const VELOCIDADE = 700;
const MOLA = { damping: 20, stiffness: 220, mass: 0.8 };

const PRIORIDADE: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function indiceDa(status: string): number {
  const posicao = ETAPAS.findIndex((etapa) => etapa.id === status);
  return posicao === -1 ? 0 : posicao;
}

export function Pendencias({
  tarefas,
  today,
  onMudou,
}: {
  tarefas: readonly BoardTask[];
  today: string;
  /** Recarrega o painel: a tarefa concluída sai da lista e o resumo muda. */
  onMudou: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  /** Etapa escolhida aqui que o servidor ainda não confirmou. */
  const [movidas, setMovidas] = useState<Record<string, Etapa>>({});

  const abertas = useMemo(() => {
    const situacao = (tarefa: BoardTask) => movidas[tarefa.id] ?? tarefa.status;
    return [...tarefas]
      .filter((tarefa) => situacao(tarefa) !== "done")
      .sort((esquerda, direita) => {
        if (esquerda.isLate !== direita.isLate) return esquerda.isLate ? -1 : 1;
        if (esquerda.dueOn !== direita.dueOn) {
          if (esquerda.dueOn === null) return 1;
          if (direita.dueOn === null) return -1;
          return esquerda.dueOn < direita.dueOn ? -1 : 1;
        }
        return (PRIORIDADE[esquerda.priority] ?? 9) - (PRIORIDADE[direita.priority] ?? 9);
      });
  }, [tarefas, movidas]);

  if (tarefas.length === 0) return null;

  const atrasadas = abertas.filter((tarefa) => tarefa.isLate).length;
  const paraHoje = abertas.filter((tarefa) => tarefa.dueOn === today).length;

  return (
    <Card>
      <Label>Pendências</Label>
      <Small style={{ marginTop: 2, marginBottom: space.md }}>
        {atrasadas > 0 || paraHoje > 0
          ? [
              atrasadas > 0 ? `${atrasadas} atrasada${atrasadas === 1 ? "" : "s"}` : null,
              paraHoje > 0 ? `${paraHoje} para hoje` : null,
            ]
              .filter(Boolean)
              .join(" · ") + " · arraste para mudar a etapa"
          : `${abertas.length} em aberto · arraste para mudar a etapa`}
      </Small>

      {erro ? (
        <View style={{ marginBottom: space.md }}>
          <Notice tone="negative">{erro}</Notice>
        </View>
      ) : null}

      <View style={{ gap: space.sm }}>
        {abertas.map((tarefa) => (
          <CartaoDePendencia
            key={tarefa.id}
            tarefa={tarefa}
            etapa={movidas[tarefa.id] ?? (tarefa.status as Etapa)}
            onMover={(destino) => {
              setMovidas((atual) => ({ ...atual, [tarefa.id]: destino }));
              setErro(null);
            }}
            onFalhou={(mensagem) => {
              setMovidas((atual) => {
                const { [tarefa.id]: _fora, ...resto } = atual;
                return resto;
              });
              setErro(mensagem);
            }}
            onConfirmou={onMudou}
          />
        ))}
      </View>

      <Small tone="muted" style={{ marginTop: space.md }}>
        Arrastar até o fim conclui. Criar e apagar continua no site.
      </Small>
    </Card>
  );
}

function CartaoDePendencia({
  tarefa,
  etapa,
  onMover,
  onFalhou,
  onConfirmou,
}: {
  tarefa: BoardTask;
  etapa: Etapa;
  onMover: (destino: Etapa) => void;
  onFalhou: (mensagem: string) => void;
  onConfirmou: () => void;
}) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const deslocamento = useSharedValue(0);

  const posicao = indiceDa(etapa);
  const anterior = ETAPAS[posicao - 1] ?? null;
  const proxima = ETAPAS[posicao + 1] ?? null;

  async function aplicar(destino: Etapa) {
    onMover(destino);
    try {
      await call(`/api/v1/tasks/${tarefa.id}`, {
        baseUrl: credentials.baseUrl,
        token: credentials.token,
        method: "PATCH",
        body: { status: destino },
      });
      onConfirmou();
    } catch (problema) {
      onFalhou(problema instanceof Error ? problema.message : "Não foi possível mudar a etapa.");
    }
  }

  /*
   * `activeOffsetX` deixa a rolagem vertical passar.
   *
   * Sem isso, qualquer toque que comece no cartão captura o gesto e a lista
   * inteira trava — o dedo desce e a tela não acompanha.
   */
  const arrastar = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onUpdate((evento) => {
      // Não deixa arrastar para um lado que não existe: no começo da fila não
      // há etapa anterior, e o cartão que se estica para o vazio promete uma
      // ação que não vai acontecer.
      const bruto = evento.translationX;
      if (bruto > 0 && !proxima) deslocamento.value = bruto * 0.15;
      else if (bruto < 0 && !anterior) deslocamento.value = bruto * 0.15;
      else deslocamento.value = bruto;
    })
    .onEnd((evento) => {
      const distancia = deslocamento.value;
      const rapido = Math.abs(evento.velocityX) > VELOCIDADE;
      const passou = Math.abs(distancia) > LIMIAR || rapido;
      const destino = distancia > 0 ? proxima : anterior;

      deslocamento.value = withSpring(0, MOLA);
      if (passou && destino) runOnJS(aplicar)(destino.id);
    });

  const estilo = useAnimatedStyle(() => ({
    transform: [{ translateX: deslocamento.value }],
  }));

  /** O destino aparece atrás do cartão, na medida em que o dedo o descobre. */
  const estiloDireita = useAnimatedStyle(() => ({
    opacity: interpolate(deslocamento.value, [0, LIMIAR], [0, 1], Extrapolation.CLAMP),
  }));
  const estiloEsquerda = useAnimatedStyle(() => ({
    opacity: interpolate(deslocamento.value, [-LIMIAR, 0], [1, 0], Extrapolation.CLAMP),
  }));

  const concluindo = proxima?.id === "done";

  return (
    <View style={{ position: "relative" }}>
      {/* O fundo: à esquerda a etapa anterior, à direita a seguinte. */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderRadius: radius.md,
          backgroundColor: palette.surfaceInset,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: space.md,
        }}
      >
        <Animated.View style={estiloEsquerda}>
          <Small tone="muted">{anterior ? `← ${anterior.label}` : ""}</Small>
        </Animated.View>
        <Animated.View style={estiloDireita}>
          <Small tone={concluindo ? "positive" : "muted"}>
            {proxima ? `${proxima.label} →` : ""}
          </Small>
        </Animated.View>
      </View>

      <GestureDetector gesture={arrastar}>
        <Animated.View
          style={[
            estilo,
            {
              backgroundColor: palette.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: palette.line,
              padding: space.md,
            },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
            <View
              style={{
                width: 8,
                height: 8,
                marginTop: 5,
                borderRadius: radius.pill,
                backgroundColor: tarefa.projectColor ?? palette.accent,
              }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Body numberOfLines={2}>{tarefa.title}</Body>
              <Small tone={tarefa.isLate ? "negative" : "subtle"} style={{ marginTop: 2 }}>
                {ROTULO.get(etapa) ?? etapa} · {tarefa.projectName}
                {tarefa.dueOn ? ` · ${relativeDate(tarefa.dueOn as never)}` : ""}
              </Small>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
