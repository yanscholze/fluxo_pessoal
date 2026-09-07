/**
 * Trabalho.
 *
 * A tela mostrava só tarefas, vindas do quadro. Quem tem projeto sem tarefa
 * cadastrada — que é o caso comum de quem toca um trabalho sozinho — via uma
 * tela vazia e concluía que o aplicativo não conhecia os projetos dele.
 *
 * Agora o projeto vem primeiro, com o que se pergunta sobre ele longe do
 * computador: quanto já entrou do combinado, quantas horas foram, e quanto
 * falta para o prazo. As tarefas vêm depois, quando existem.
 */

import { useMemo } from "react";
import { View } from "react-native";

import { cents } from "@fluxo/core/kernel/money.ts";
import { fetchBoard, fetchProjetos, type BoardTask, type ProjetoView } from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { Medidor } from "../ui/charts.tsx";
import { money, relativeDate } from "../ui/format.ts";
import { Body, Card, Empty, Figure, Label, Row, Small } from "../ui/primitives.tsx";
import { TelaRemota } from "../ui/tela-remota.tsx";
import { radius, space, usePalette } from "../ui/theme.ts";

/** Rótulo humano da situação do projeto, na ordem em que ele caminha. */
const SITUACAO: Record<string, string> = {
  draft: "Rascunho",
  development: "Em desenvolvimento",
  testing: "Em testes",
  adjustments: "Em ajustes",
  delivered: "Entregue",
  archived: "Arquivado",
};

/** Milésimos de hora viram horas. O domínio guarda em milli para não arredondar. */
const emHoras = (milli: number) => milli / 1000;

export function TrabalhoScreen({ onVoltar }: { onVoltar?: () => void }) {
  const remoto = useRemoto(fetchProjetos);
  const quadro = useRemoto(fetchBoard);

  return (
    <TelaRemota
      titulo="Trabalho"
      descricao="O que está aberto nos projetos."
      remoto={remoto}
      onVoltar={onVoltar}
    >
      {(dados) => (
        <>
          <Card>
            <Label>A receber</Label>
            <Figure tone={dados.totals.overdueCents > 0 ? "negative" : "neutral"}>
              {money(cents(dados.totals.pendingCents))}
            </Figure>
            <Small style={{ marginTop: 2 }}>
              {dados.totals.activeProjects} projeto{dados.totals.activeProjects === 1 ? "" : "s"} ativo
              {dados.totals.activeProjects === 1 ? "" : "s"} ·{" "}
              {emHoras(dados.totals.weekMilli).toFixed(1)} h na semana
              {dados.totals.overdueCents > 0
                ? ` · ${money(cents(dados.totals.overdueCents))} vencido`
                : ""}
            </Small>
          </Card>

          {dados.projects.length === 0 ? (
            <Card>
              <Empty title="Nenhum projeto" hint="Crie no site para acompanhar aqui." />
            </Card>
          ) : (
            dados.projects.map((projeto) => <CartaoDeProjeto key={projeto.id} projeto={projeto} />)
          )}

          <Pendencias tarefas={quadro.dados?.tasks ?? []} />
        </>
      )}
    </TelaRemota>
  );
}

function CartaoDeProjeto({ projeto }: { projeto: ProjetoView }) {
  const palette = usePalette();

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: radius.pill,
            backgroundColor: projeto.color ?? palette.accent,
          }}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body strong numberOfLines={1}>
            {projeto.name}
          </Body>
          <Small>
            {projeto.clientName ?? "projeto próprio"} · {SITUACAO[projeto.status] ?? projeto.status}
            {projeto.dueOn ? ` · prazo ${relativeDate(projeto.dueOn as never)}` : ""}
          </Small>
        </View>
      </View>

      {projeto.contractedCents > 0 ? (
        <View style={{ marginTop: space.md, gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Small>Recebido</Small>
            <Small tone="muted">
              {money(cents(projeto.receivedCents))} de {money(cents(projeto.contractedCents))}
            </Small>
          </View>
          <Medidor valor={projeto.percentReceived} total={100} tom="positive" altura={4} />
        </View>
      ) : null}

      {projeto.estimatedMilli > 0 ? (
        <View style={{ marginTop: space.sm, gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Small>Horas</Small>
            <Small tone={projeto.overrun ? "negative" : "muted"}>
              {emHoras(projeto.workedMilli).toFixed(1)} de {emHoras(projeto.estimatedMilli).toFixed(1)} h
            </Small>
          </View>
          <Medidor
            valor={projeto.workedMilli}
            total={Math.max(1, projeto.estimatedMilli)}
            tom={projeto.overrun ? "negative" : "accent"}
            altura={4}
          />
        </View>
      ) : null}

      {projeto.openTasks > 0 ? (
        <Small style={{ marginTop: space.sm }}>
          {projeto.openTasks} pendência{projeto.openTasks === 1 ? "" : "s"}
        </Small>
      ) : null}
    </Card>
  );
}

/** As tarefas abertas, com as atrasadas primeiro. */
function Pendencias({ tarefas }: { tarefas: readonly BoardTask[] }) {
  const palette = usePalette();
  const abertas = useMemo(
    () =>
      [...tarefas]
        .filter((tarefa) => tarefa.status !== "done")
        .sort((esquerda, direita) => Number(direita.isLate) - Number(esquerda.isLate)),
    [tarefas],
  );

  if (abertas.length === 0) return null;

  return (
    <Card>
      <Label style={{ marginBottom: space.xs }}>Pendências ({abertas.length})</Label>
      {abertas.map((tarefa, indice) => (
        <Row key={tarefa.id} style={indice === abertas.length - 1 ? { borderBottomWidth: 0 } : undefined}>
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
                {tarefa.dueOn ? ` · ${relativeDate(tarefa.dueOn as never)}` : ""}
              </Small>
            </View>
          </View>
        </Row>
      ))}
    </Card>
  );
}
