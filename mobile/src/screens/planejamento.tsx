/**
 * Planejamento.
 *
 * A tela existe por causa de um gesto: confirmar a recorrência do mês. É a
 * ação mais barata do produto — um toque transforma uma projeção em lançamento
 * de verdade — e era a que mais fazia falta no bolso, porque acontece quando o
 * salário cai ou a conta chega, longe do computador.
 *
 * Por isso "aguardando confirmação" vem primeiro, com o botão na própria linha.
 * Assinaturas e projeção vêm depois: são leitura, não ação.
 */

import { View } from "react-native";

import { cents } from "@fluxo/core/kernel/money.ts";
import { fetchPlanning } from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { competence, money, relativeDate } from "../ui/format.ts";
import { Body, Card, Empty, Figure, Label, Row, Small } from "../ui/primitives.tsx";
import { TelaRemota } from "../ui/tela-remota.tsx";
import { space, usePalette } from "../ui/theme.ts";
import { OccurrenceActions } from "./occurrence-actions.tsx";

export function PlanejamentoScreen({ onVoltar }: { onVoltar?: () => void }) {
  const palette = usePalette();
  const remoto = useRemoto(fetchPlanning);

  return (
    <TelaRemota
      titulo="Planejamento"
      descricao="O que você combinou consigo mesmo."
      remoto={remoto}
      onVoltar={onVoltar}
    >
      {(dados) => {
        const pendentes = dados.recurrences.filter((regra) => regra.isActive && regra.pending !== null);

        return (
          <>
            <Card>
              <Label style={{ marginBottom: space.xs }}>
                Aguardando confirmação {pendentes.length > 0 ? `(${pendentes.length})` : ""}
              </Label>
              {pendentes.length === 0 ? (
                <Empty title="Nada pendente" hint="Todas as recorrências do mês já foram confirmadas." />
              ) : (
                pendentes.map((regra, indice) => (
                  <View
                    key={regra.id}
                    style={{
                      paddingVertical: space.md,
                      borderBottomWidth: indice === pendentes.length - 1 ? 0 : 1,
                      borderBottomColor: palette.line,
                      gap: space.sm,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Body numberOfLines={1}>{regra.description}</Body>
                        <Small>
                          {regra.originName}
                          {regra.pending ? ` · ${relativeDate(regra.pending.date as never)}` : ""}
                        </Small>
                      </View>
                      <Body
                        strong
                        style={{ color: regra.kind === "income" ? palette.positive : palette.ink }}
                      >
                        {money(cents(regra.pending?.amountCents ?? regra.amountCents))}
                      </Body>
                    </View>
                    <OccurrenceActions rule={regra} onDone={remoto.recarregar} />
                  </View>
                ))
              )}
            </Card>

            <Card>
              <Label>Assinaturas</Label>
              <Figure small>{money(cents(dados.subscriptions.monthlyCents))}</Figure>
              <Small style={{ marginTop: 2 }}>
                por mês · {money(cents(dados.subscriptions.yearlyCents))} no ano ·{" "}
                {dados.subscriptions.activeCount} ativa
                {dados.subscriptions.activeCount === 1 ? "" : "s"}
              </Small>
              {dados.subscriptions.upcoming.length > 0 ? (
                <View style={{ marginTop: space.md }}>
                  <Small style={{ marginBottom: 4 }}>Próximos 7 dias</Small>
                  {dados.subscriptions.upcoming.slice(0, 6).map((cobranca, indice) => (
                    <Row
                      key={`${cobranca.recurrenceId}-${indice}`}
                      style={
                        indice === Math.min(5, dados.subscriptions.upcoming.length - 1)
                          ? { borderBottomWidth: 0 }
                          : undefined
                      }
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Body numberOfLines={1}>{cobranca.description}</Body>
                        <Small>{relativeDate(cobranca.date as never)}</Small>
                      </View>
                      <Body strong>{money(cents(cobranca.amountCents))}</Body>
                    </Row>
                  ))}
                </View>
              ) : null}
            </Card>

            {dados.projection.length > 0 ? (
              <Card>
                <Label style={{ marginBottom: space.xs }}>Sobra projetada</Label>
                {dados.projection.slice(0, 6).map((mes, indice) => (
                  <Row
                    key={mes.competence}
                    style={indice === Math.min(5, dados.projection.length - 1) ? { borderBottomWidth: 0 } : undefined}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Body>{competence(mes.competence as never)}</Body>
                      <Small>
                        entra {money(cents(mes.incomeCents))} · sai {money(cents(mes.committedCents))}
                      </Small>
                    </View>
                    <Body strong style={{ color: mes.freeCents < 0 ? palette.negative : palette.positive }}>
                      {money(cents(mes.freeCents))}
                    </Body>
                  </Row>
                ))}
              </Card>
            ) : null}

            <Card>
              <Label style={{ marginBottom: space.xs }}>Todas as recorrências</Label>
              {dados.recurrences.length === 0 ? (
                <Empty title="Nenhuma recorrência" hint="Cadastre no site para elas aparecerem aqui." />
              ) : (
                dados.recurrences.map((regra, indice) => (
                  <Row
                    key={regra.id}
                    style={indice === dados.recurrences.length - 1 ? { borderBottomWidth: 0 } : undefined}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Body numberOfLines={1} muted={!regra.isActive}>
                        {regra.description}
                      </Body>
                      <Small>
                        {regra.scheduleLabel}
                        {regra.isActive ? "" : " · pausada"}
                      </Small>
                    </View>
                    <Body strong>{money(cents(regra.amountCents))}</Body>
                  </Row>
                ))
              )}
            </Card>
          </>
        );
      }}
    </TelaRemota>
  );
}
