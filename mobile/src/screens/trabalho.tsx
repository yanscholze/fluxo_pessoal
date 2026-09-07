/**
 * Trabalho.
 *
 * A área de projetos, que não existia no aplicativo. É a tela que se abre a
 * caminho do cliente: o que está atrasado, o que vence hoje, o que vem depois.
 *
 * O quadro do site tem quatro colunas lado a lado; aqui vira uma lista agrupada
 * por situação. Coluna horizontal no celular obriga a rolar de lado para
 * descobrir que existe conteúdo — e o que não se vê não é consultado.
 *
 * A ordem é por urgência, não por projeto: quem olha isso no celular quer saber
 * o que fazer agora, e agrupar por projeto esconde o atraso no meio da lista.
 */

import { useMemo } from "react";
import { View } from "react-native";

import { fetchBoard, type BoardTask } from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { relativeDate } from "../ui/format.ts";
import { Body, Card, Empty, Figure, Label, Row, Small } from "../ui/primitives.tsx";
import { TelaRemota } from "../ui/tela-remota.tsx";
import { radius, space, usePalette } from "../ui/theme.ts";

/** Rótulos das situações, na ordem em que uma tarefa caminha. */
const SITUACOES: readonly { readonly id: string; readonly label: string }[] = [
  { id: "todo", label: "A fazer" },
  { id: "doing", label: "Em andamento" },
  { id: "blocked", label: "Travada" },
  { id: "done", label: "Concluída" },
];

export function TrabalhoScreen({ onVoltar }: { onVoltar?: () => void }) {
  const palette = usePalette();
  const remoto = useRemoto(fetchBoard);

  return (
    <TelaRemota
      titulo="Trabalho"
      descricao="O que está aberto nos projetos."
      remoto={remoto}
      onVoltar={onVoltar}
    >
      {(dados) => <Conteudo tarefas={dados.tasks} projetos={dados.projects.length} palette={palette} />}
    </TelaRemota>
  );
}

function Conteudo({
  tarefas,
  projetos,
  palette,
}: {
  tarefas: readonly BoardTask[];
  projetos: number;
  palette: ReturnType<typeof usePalette>;
}) {
  const atrasadas = useMemo(() => tarefas.filter((tarefa) => tarefa.isLate), [tarefas]);

  const porSituacao = useMemo(() => {
    const mapa = new Map<string, BoardTask[]>();
    for (const tarefa of tarefas) {
      const lista = mapa.get(tarefa.status) ?? [];
      lista.push(tarefa);
      mapa.set(tarefa.status, lista);
    }
    return mapa;
  }, [tarefas]);

  if (tarefas.length === 0) {
    return <Empty title="Nenhuma tarefa" hint="Os projetos estão sem pendências cadastradas." />;
  }

  return (
    <>
      <Card>
        <Label>Pendências</Label>
        <Figure tone={atrasadas.length > 0 ? "negative" : "neutral"}>{tarefas.length}</Figure>
        <Small style={{ marginTop: 2 }}>
          em {projetos} projeto{projetos === 1 ? "" : "s"}
          {atrasadas.length > 0 ? ` · ${atrasadas.length} atrasada${atrasadas.length > 1 ? "s" : ""}` : ""}
        </Small>
      </Card>

      {atrasadas.length > 0 ? (
        <Card>
          <Label style={{ marginBottom: space.xs }}>Atrasadas</Label>
          {atrasadas.map((tarefa, indice) => (
            <LinhaDeTarefa
              key={tarefa.id}
              tarefa={tarefa}
              ultima={indice === atrasadas.length - 1}
              palette={palette}
            />
          ))}
        </Card>
      ) : null}

      {SITUACOES.map((situacao) => {
        const lista = (porSituacao.get(situacao.id) ?? []).filter((tarefa) => !tarefa.isLate);
        if (lista.length === 0) return null;

        return (
          <Card key={situacao.id}>
            <Label style={{ marginBottom: space.xs }}>
              {situacao.label} ({lista.length})
            </Label>
            {lista.map((tarefa, indice) => (
              <LinhaDeTarefa
                key={tarefa.id}
                tarefa={tarefa}
                ultima={indice === lista.length - 1}
                palette={palette}
              />
            ))}
          </Card>
        );
      })}
    </>
  );
}

function LinhaDeTarefa({
  tarefa,
  ultima,
  palette,
}: {
  tarefa: BoardTask;
  ultima: boolean;
  palette: ReturnType<typeof usePalette>;
}) {
  return (
    <Row style={ultima ? { borderBottomWidth: 0 } : undefined}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1, minWidth: 0 }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: radius.pill,
            backgroundColor: tarefa.projectColor ?? palette.accent,
          }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body numberOfLines={1}>{tarefa.title}</Body>
          <Small tone={tarefa.isLate ? "negative" : "subtle"}>
            {tarefa.projectName}
            {tarefa.clientName ? ` · ${tarefa.clientName}` : ""}
            {tarefa.dueOn ? ` · ${relativeDate(tarefa.dueOn as never)}` : ""}
          </Small>
        </View>
      </View>
    </Row>
  );
}
