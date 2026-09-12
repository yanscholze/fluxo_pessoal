/**
 * Assinaturas.
 *
 * A pergunta desta tela não é "quanto gastei" — é **"quanto disto eu ainda
 * quero"**. Assinatura é a despesa que ninguém decide todo mês: foi decidida
 * uma vez e cobra para sempre, e por isso a única leitura que muda alguma coisa
 * é o custo anual. R$ 34,90 por mês não dói; R$ 418,80 por ano faz cancelar.
 *
 * Por isso o anual vem primeiro e grande, e o mensal aparece embaixo como
 * referência. O contrário — que é o instinto, porque a cobrança é mensal — é
 * exatamente o que faz assinatura acumular sem ninguém perceber.
 *
 * A divisão por classificação existe para responder a pergunta seguinte: entre
 * streaming, IA e anuidade de cartão, qual bolo cresceu.
 */

import { View } from "react-native";

import { cents } from "@fluxo/core/kernel/money.ts";
import { fetchAssinaturas } from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { Medidor } from "../ui/charts.tsx";
import { money, percent } from "../ui/format.ts";
import { Body, Card, Empty, Figure, Label, Row, Small } from "../ui/primitives.tsx";
import { TelaRemota } from "../ui/tela-remota.tsx";
import { radius, space, usePalette } from "../ui/theme.ts";

export function AssinaturasScreen({ onVoltar }: { onVoltar?: () => void }) {
  const palette = usePalette();
  const remoto = useRemoto(fetchAssinaturas);

  return (
    <TelaRemota
      titulo="Assinaturas"
      descricao="O que cobra todo mês sem você decidir de novo."
      remoto={remoto}
      onVoltar={onVoltar}
    >
      {(dados) => (
        <>
          <Card>
            <Label>Custo anual</Label>
            <Figure tone={dados.totals.yearlyCents > 0 ? "negative" : "neutral"}>
              {money(cents(dados.totals.yearlyCents))}
            </Figure>
            <Small style={{ marginTop: 2 }}>
              {money(cents(dados.totals.monthlyCents))} por mês · {dados.totals.activeCount} ativa
              {dados.totals.activeCount === 1 ? "" : "s"}
              {dados.totals.pausedCount > 0 ? ` · ${dados.totals.pausedCount} pausada` : ""}
            </Small>
          </Card>

          {dados.byLabel.length > 0 ? (
            <Card>
              <Label style={{ marginBottom: space.xs }}>Por classificação</Label>
              {dados.byLabel.map((grupo, indice) => (
                <View
                  key={grupo.label.id}
                  style={{
                    paddingVertical: space.sm,
                    borderBottomWidth: indice === dados.byLabel.length - 1 ? 0 : 1,
                    borderBottomColor: palette.line,
                    gap: 6,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1, minWidth: 0 }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: radius.pill,
                          backgroundColor: grupo.label.color || palette.accent,
                        }}
                      />
                      <Body numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>
                        {grupo.label.name}
                      </Body>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Body strong>{money(cents(grupo.yearlyCents))}</Body>
                      <Small>{money(cents(grupo.monthlyCents))}/mês</Small>
                    </View>
                  </View>
                  {/*
                    A cor da classificação na barra, e não o acento: numa lista
                    em que o ponto já é colorido, uma barra de outra cor faria a
                    mesma assinatura parecer duas coisas.
                  */}
                  <Medidor
                    valor={grupo.sharePercent}
                    total={100}
                    cor={grupo.label.color || undefined}
                    altura={4}
                  />
                  <Small tone="subtle">
                    {percent(grupo.sharePercent)} do total · {grupo.count} assinatura
                    {grupo.count === 1 ? "" : "s"}
                  </Small>
                </View>
              ))}
            </Card>
          ) : null}

          <Card>
            <Label style={{ marginBottom: space.xs }}>Cadastradas ({dados.subscriptions.length})</Label>
            {dados.subscriptions.length === 0 ? (
              <Empty
                title="Nenhuma assinatura"
                hint="Cadastre uma recorrência com o papel Assinatura para acompanhar o custo aqui."
              />
            ) : (
              dados.subscriptions.map((item, indice) => (
                <Row
                  key={item.id}
                  style={indice === dados.subscriptions.length - 1 ? { borderBottomWidth: 0 } : undefined}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body numberOfLines={1}>{item.description}</Body>
                    <Small>
                      {item.cardName ?? "conta"} · dia {item.scheduleDay}
                      {item.interval === "yearly" ? " · anual" : ""}
                      {item.label ? ` · ${item.label.name}` : ""}
                      {item.isActive ? "" : " · pausada"}
                    </Small>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Body strong>{money(cents(item.amountCents))}</Body>
                    {item.interval === "yearly" ? (
                      <Small>{money(cents(item.monthlyCents))}/mês</Small>
                    ) : null}
                  </View>
                </Row>
              ))
            )}
          </Card>
        </>
      )}
    </TelaRemota>
  );
}
