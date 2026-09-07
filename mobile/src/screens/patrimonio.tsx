/**
 * Patrimônio.
 *
 * A pergunta de fim de mês: quanto sobrou de tudo. Vem depois do saldo no
 * Início porque é a leitura lenta — ninguém decide uma compra por ela —, mas
 * não é leitura de mesa: é exatamente o número que se quer conferir num
 * domingo, no sofá.
 *
 * A variação vem junto do total desde o primeiro momento. Um patrimônio de
 * R$ 40 mil não diz se o mês foi bom; "R$ 40 mil, R$ 1.200 a mais que no mês
 * passado" diz.
 */

import { View } from "react-native";

import { cents } from "@fluxo/core/kernel/money.ts";
import { fetchNetWorth } from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { Sparkbars } from "../ui/charts.tsx";
import { competence, money, percent } from "../ui/format.ts";
import { Body, Card, Empty, Figure, Label, Row, Small } from "../ui/primitives.tsx";
import { TelaRemota } from "../ui/tela-remota.tsx";
import { radius, space, usePalette } from "../ui/theme.ts";

export function PatrimonioScreen({ onVoltar }: { onVoltar?: () => void }) {
  const palette = usePalette();
  const remoto = useRemoto(fetchNetWorth);

  return (
    <TelaRemota
      titulo="Patrimônio"
      descricao="O que sobra depois de tirar o que se deve."
      remoto={remoto}
      onVoltar={onVoltar}
    >
      {(dados) => (
        <>
          <Card>
            <Label>Patrimônio líquido</Label>
            <Figure tone={dados.netWorthCents < 0 ? "negative" : "neutral"}>
              {money(cents(dados.netWorthCents))}
            </Figure>
            {dados.changeCents !== 0 ? (
              <Small
                tone={dados.changeCents > 0 ? "positive" : "negative"}
                style={{ marginTop: 4 }}
              >
                {dados.changeCents > 0 ? "+" : "−"}
                {money(cents(Math.abs(dados.changeCents)))}
                {dados.changePercent !== null ? ` (${percent(dados.changePercent, 1)})` : ""} no período
              </Small>
            ) : null}

            {dados.history.length > 1 ? (
              <View style={{ marginTop: space.md }}>
                <Sparkbars
                  valores={dados.history.map((ponto) => ponto.netCents)}
                  cor={dados.changeCents >= 0 ? palette.positive : palette.negative}
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                  <Small>{competence(dados.history[0].competence as never)}</Small>
                  <Small>{competence(dados.history[dados.history.length - 1].competence as never)}</Small>
                </View>
              </View>
            ) : null}
          </Card>

          <Card>
            <Label style={{ marginBottom: space.xs }}>Composição</Label>
            <Row>
              <Body muted>Em conta</Body>
              <Body strong>{money(cents(dados.liquidCents))}</Body>
            </Row>
            <Row>
              <Body muted>Guardado</Body>
              <Body strong>{money(cents(dados.investedCents))}</Body>
            </Row>
            <Row style={{ borderBottomWidth: 0 }}>
              <Body muted>Dívidas</Body>
              <Body strong style={{ color: palette.negative }}>
                −{money(cents(dados.liabilitiesCents))}
              </Body>
            </Row>
          </Card>

          <Card>
            <Label style={{ marginBottom: space.xs }}>Onde está</Label>
            {dados.holdings.length === 0 ? (
              <Empty title="Sem contas" hint="Nenhuma conta somando no patrimônio." />
            ) : (
              dados.holdings.map((conta, indice) => (
                <Row
                  key={conta.id}
                  style={indice === dados.holdings.length - 1 ? { borderBottomWidth: 0 } : undefined}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1, minWidth: 0 }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: radius.pill,
                        backgroundColor: conta.color || palette.accent,
                      }}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Body numberOfLines={1}>{conta.name}</Body>
                      <Small>{percent(conta.sharePercent, 1)} dos ativos</Small>
                    </View>
                  </View>
                  <Body strong>{money(cents(conta.balanceCents))}</Body>
                </Row>
              ))
            )}
          </Card>

          {dados.liabilities.length > 0 ? (
            <Card>
              <Label style={{ marginBottom: space.xs }}>O que se deve</Label>
              {dados.liabilities.map((divida, indice) => (
                <Row
                  key={divida.id}
                  style={indice === dados.liabilities.length - 1 ? { borderBottomWidth: 0 } : undefined}
                >
                  <Body numberOfLines={1}>{divida.name}</Body>
                  <Body strong style={{ color: palette.negative }}>
                    {money(cents(divida.amountCents))}
                  </Body>
                </Row>
              ))}
            </Card>
          ) : null}
        </>
      )}
    </TelaRemota>
  );
}
