/**
 * Trabalho.
 *
 * A tela mostrava só tarefas, vindas do quadro. Quem tem projeto sem tarefa
 * cadastrada — que é o caso comum de quem toca um trabalho sozinho — via uma
 * tela vazia e concluía que o aplicativo não conhecia os projetos dele.
 *
 * Agora a tela é dos projetos, e só deles: quanto já entrou do combinado,
 * quantas horas foram, quanto falta para o prazo — o que se pergunta sobre um
 * projeto longe do computador.
 *
 * As pendências saíram daqui para o painel. Elas estavam no fim desta tela,
 * atrás da lista de projetos, e respondem a outra pergunta: não "como vai este
 * projeto", e sim "o que eu faço hoje" — que é a primeira do dia e por isso
 * pertence à primeira tela.
 */

import { useMemo, useState } from "react";
import { Modal, Pressable, View } from "react-native";

import { cents } from "@fluxo/core/kernel/money.ts";
import { fetchProjetos, type ProjetoView } from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { HorasScreen } from "./horas.tsx";
import { Medidor } from "../ui/charts.tsx";
import { money, relativeDate } from "../ui/format.ts";
import {
  Body,
  Card,
  Empty,
  Figure,
  Label,
  Row,
  Small,
} from "../ui/primitives.tsx";
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
  /**
   * O projeto cujo registro de horas está aberto.
   *
   * A lista já respondia "quanto falta"; faltava agir sobre a resposta. Tocar
   * o card é o gesto mais curto entre ver que trabalhei e registrar quanto —
   * e é no celular, logo depois da sessão, que esse registro ainda é exato.
   */
  const [registrando, setRegistrando] = useState<ProjetoView | null>(null);

  function encerrar() {
    setRegistrando(null);
    // As horas mudam o total da tela: sem recarregar, o card ficaria mostrando
    // o número de antes e pareceria que o registro não foi.
    remoto.recarregar();
  }

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
            {/*
              O que falta entrar, e não só o que está agendado.

              `pendingCents` conta parcela criada. Quem combinou R$ 900 e ainda
              não montou o cronograma via "R$ 0,00 a receber" com o projeto em
              aberto — o número mais desanimador possível, e errado.
            */}
            <Figure
              tone={dados.totals.overdueCents > 0 ? "negative" : "neutral"}
            >
              {money(
                cents(
                  dados.totals.pendingCents +
                    dados.totals.overdueCents +
                    dados.totals.unscheduledCents,
                ),
              )}
            </Figure>
            <Small style={{ marginTop: 2 }}>
              {dados.totals.activeProjects} projeto
              {dados.totals.activeProjects === 1 ? "" : "s"} ativo
              {dados.totals.activeProjects === 1 ? "" : "s"} ·{" "}
              {emHoras(dados.totals.weekMilli).toFixed(1)} h na semana
              {dados.totals.overdueCents > 0
                ? ` · ${money(cents(dados.totals.overdueCents))} vencido`
                : ""}
              {dados.totals.unscheduledCents > 0
                ? ` · ${money(cents(dados.totals.unscheduledCents))} sem parcela agendada`
                : ""}
            </Small>
          </Card>

          {dados.projects.length === 0 ? (
            <Card>
              <Empty
                title="Nenhum projeto"
                hint="Crie no site para acompanhar aqui."
              />
            </Card>
          ) : (
            dados.projects.map((projeto) => (
              <CartaoDeProjeto
                key={projeto.id}
                projeto={projeto}
                onRegistrarHoras={() => setRegistrando(projeto)}
              />
            ))
          )}

          <Modal
            visible={registrando !== null}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={encerrar}
          >
            {registrando ? (
              <HorasScreen projeto={registrando} onClose={encerrar} />
            ) : null}
          </Modal>
        </>
      )}
    </TelaRemota>
  );
}

function CartaoDeProjeto({
  projeto,
  onRegistrarHoras,
}: {
  projeto: ProjetoView;
  onRegistrarHoras: () => void;
}) {
  const palette = usePalette();

  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Registrar horas em ${projeto.name}`}
        onPress={onRegistrarHoras}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
        >
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
              {projeto.clientName ?? "projeto próprio"} ·{" "}
              {SITUACAO[projeto.status] ?? projeto.status}
              {projeto.dueOn
                ? ` · prazo ${relativeDate(projeto.dueOn as never)}`
                : ""}
            </Small>
          </View>
        </View>

        {projeto.contractedCents > 0 ? (
          <View style={{ marginTop: space.md, gap: 4 }}>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Small>Recebido</Small>
              <Small tone="muted">
                {money(cents(projeto.receivedCents))} de{" "}
                {money(cents(projeto.contractedCents))}
              </Small>
            </View>
            <Medidor
              valor={projeto.percentReceived}
              total={100}
              tom="positive"
              altura={4}
            />
          </View>
        ) : null}

        {projeto.estimatedMilli > 0 ? (
          <View style={{ marginTop: space.sm, gap: 4 }}>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Small>Horas</Small>
              <Small tone={projeto.overrun ? "negative" : "muted"}>
                {emHoras(projeto.workedMilli).toFixed(1)} de{" "}
                {emHoras(projeto.estimatedMilli).toFixed(1)} h
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

        <Small tone="muted" style={{ marginTop: space.sm }}>
          Toque para registrar horas
        </Small>
      </Pressable>
    </Card>
  );
}
