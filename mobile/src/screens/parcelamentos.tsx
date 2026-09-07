/**
 * Parcelamentos.
 *
 * A dívida que já foi decidida e continua chegando. O número que importa não é
 * o total da compra — esse já foi gasto e não se desfaz — e sim **quanto ainda
 * falta** e **quando**. Por isso o aberto vem em destaque e o total só aparece
 * na linha de progresso.
 *
 * O comprometimento futuro fecha a tela porque é a pergunta seguinte natural:
 * sabendo que devo tanto, quanto disso cai em cada mês que vem.
 */

import { View } from "react-native";

import { cents } from "@fluxo/core/kernel/money.ts";
import { fetchInstallments } from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { Medidor } from "../ui/charts.tsx";
import { competence, money, percent, relativeDate } from "../ui/format.ts";
import { Body, Card, Empty, Figure, Label, Row, Small } from "../ui/primitives.tsx";
import { TelaRemota } from "../ui/tela-remota.tsx";
import { space, usePalette } from "../ui/theme.ts";

export function ParcelamentosScreen({ onVoltar }: { onVoltar?: () => void }) {
  const palette = usePalette();
  const remoto = useRemoto(fetchInstallments);

  return (
    <TelaRemota
      titulo="Parcelamentos"
      descricao="O que já foi comprado e ainda está chegando."
      remoto={remoto}
      onVoltar={onVoltar}
    >
      {(dados) => (
        <>
          <Card>
            <Label>Ainda em aberto</Label>
            <Figure tone={dados.totals.openCents > 0 ? "negative" : "positive"}>
              {money(cents(dados.totals.openCents))}
            </Figure>
            <Small style={{ marginTop: 4, marginBottom: space.sm }}>
              {percent(dados.totals.percentPaid)} de {money(cents(dados.totals.totalCents))} já pago
            </Small>
            <Medidor valor={dados.totals.percentPaid} total={100} tom="positive" />
          </Card>

          {dados.commitment.length > 0 ? (
            <Card>
              <Label style={{ marginBottom: space.xs }}>Quanto cai em cada mês</Label>
              {dados.commitment.slice(0, 12).map((mes, indice) => (
                <Row
                  key={mes.competence}
                  style={indice === Math.min(11, dados.commitment.length - 1) ? { borderBottomWidth: 0 } : undefined}
                >
                  <Body muted>{competence(mes.competence as never)}</Body>
                  <Body strong>{money(cents(mes.amountCents))}</Body>
                </Row>
              ))}
            </Card>
          ) : null}

          <Card>
            <Label style={{ marginBottom: space.xs }}>Em andamento ({dados.active.length})</Label>
            {dados.active.length === 0 ? (
              <Empty title="Nenhum parcelamento aberto" hint="Nada sendo amortizado agora." />
            ) : (
              dados.active.map((plano, indice) => (
                <View
                  key={plano.planId}
                  style={{
                    paddingVertical: space.md,
                    borderBottomWidth: indice === dados.active.length - 1 ? 0 : 1,
                    borderBottomColor: palette.line,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Body numberOfLines={1}>{plano.label}</Body>
                      <Small>
                        {plano.cardName} · {plano.paidCount} de {plano.totalCount}
                        {plano.nextDueDate ? ` · próxima ${relativeDate(plano.nextDueDate as never)}` : ""}
                      </Small>
                    </View>
                    <Body strong>{money(cents(plano.openAmount))}</Body>
                  </View>
                  <Medidor
                    valor={plano.percentPaid}
                    total={100}
                    tom={plano.overdueCount > 0 ? "negative" : "accent"}
                  />
                  {plano.overdueCount > 0 ? (
                    <Small tone="negative">
                      {plano.overdueCount} parcela{plano.overdueCount > 1 ? "s" : ""} em atraso
                    </Small>
                  ) : null}
                </View>
              ))
            )}
          </Card>

          {dados.settled.length > 0 ? (
            <Card>
              <Label style={{ marginBottom: space.xs }}>Quitados ({dados.settled.length})</Label>
              {dados.settled.slice(0, 8).map((plano, indice) => (
                <Row
                  key={plano.planId}
                  style={indice === Math.min(7, dados.settled.length - 1) ? { borderBottomWidth: 0 } : undefined}
                >
                  <Body muted numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                    {plano.label}
                  </Body>
                  <Small tone="positive">{money(cents(plano.totalAmount))}</Small>
                </Row>
              ))}
            </Card>
          ) : null}
        </>
      )}
    </TelaRemota>
  );
}
