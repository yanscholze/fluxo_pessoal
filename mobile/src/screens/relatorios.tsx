/**
 * Relatórios.
 *
 * A leitura do passado, com o período trocável. No site as quatro visões
 * (resumo, despesas, renda, assinaturas) são abas lado a lado; aqui elas viram
 * seções numa rolagem só, porque aba dentro de aba no celular é onde o usuário
 * se perde — ele deixa de saber de qual nível o "voltar" o tira.
 *
 * Os insights vêm em texto, antes dos gráficos. Um gráfico exige leitura; uma
 * frase como "você gastou 18% a mais que a média" já é a conclusão que a pessoa
 * tentaria extrair dele.
 */

import { useState } from "react";
import { Pressable, View } from "react-native";

import { cents } from "@fluxo/core/kernel/money.ts";
import { fetchReport, type CategoryBreakdown, type ReportPeriod } from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { GraficoMensal } from "../ui/charts.tsx";
import { competence, money, percent } from "../ui/format.ts";
import { Body, Card, Empty, Figure, Label, Row, Small } from "../ui/primitives.tsx";
import { TelaRemota } from "../ui/tela-remota.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

const PERIODOS: readonly { readonly id: ReportPeriod; readonly label: string }[] = [
  { id: "mes", label: "Mês" },
  { id: "3m", label: "3m" },
  { id: "6m", label: "6m" },
  { id: "12m", label: "12m" },
  { id: "todos", label: "Tudo" },
];

export function RelatoriosScreen({ onVoltar }: { onVoltar?: () => void }) {
  const palette = usePalette();
  const [periodo, setPeriodo] = useState<ReportPeriod>("6m");
  const remoto = useRemoto((c) => fetchReport(c, periodo), [periodo]);

  return (
    <TelaRemota
      titulo="Relatórios"
      descricao="Para onde o dinheiro foi."
      remoto={remoto}
      onVoltar={onVoltar}
    >
      {(dados) => (
        <>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {PERIODOS.map((opcao) => {
              const ativo = opcao.id === periodo;
              return (
                <Pressable
                  key={opcao.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                  onPress={() => setPeriodo(opcao.id)}
                  style={{
                    flex: 1,
                    paddingVertical: space.sm,
                    borderRadius: radius.pill,
                    alignItems: "center",
                    backgroundColor: ativo ? palette.accent : palette.surfaceSunken,
                  }}
                >
                  <Body strong style={{ color: ativo ? palette.accentInk : palette.inkMuted }}>
                    {opcao.label}
                  </Body>
                </Pressable>
              );
            })}
          </View>

          <Card>
            <Label>Resultado do período</Label>
            <Figure tone={dados.indicators.netCents < 0 ? "negative" : "positive"}>
              {money(cents(dados.indicators.netCents))}
            </Figure>
            <View style={{ marginTop: space.sm }}>
              <Row>
                <Body muted>Entrou</Body>
                <Body strong style={{ color: palette.positive }}>
                  {money(cents(dados.indicators.incomeCents))}
                </Body>
              </Row>
              <Row>
                <Body muted>Saiu</Body>
                <Body strong style={{ color: palette.negative }}>
                  {money(cents(dados.indicators.expenseCents))}
                </Body>
              </Row>
              <Row style={{ borderBottomWidth: 0 }}>
                <Body muted>Guardado da renda</Body>
                <Body strong>{percent(dados.indicators.savingsRatePercent)}</Body>
              </Row>
            </View>
          </Card>

          {dados.insights.length > 0 ? (
            <Card>
              <Label style={{ marginBottom: space.sm }}>O que chama atenção</Label>
              {dados.insights.map((frase, indice) => (
                <Body key={indice} muted style={{ marginBottom: indice === dados.insights.length - 1 ? 0 : 6 }}>
                  {frase}
                </Body>
              ))}
            </Card>
          ) : null}

          {dados.monthly.length > 1 ? (
            <Card>
              <Label style={{ marginBottom: space.sm }}>Mês a mês</Label>
              <GraficoMensal
                barras={dados.monthly.map((ponto) => ({
                  rotulo: competence(ponto.competence as never).slice(0, 3),
                  entrada: ponto.incomeCents,
                  saida: ponto.expenseCents,
                }))}
              />
            </Card>
          ) : null}

          <Categorias titulo="Maiores saídas" itens={dados.expensesByCategory} tom={palette.negative} />
          <Categorias titulo="De onde veio" itens={dados.incomeByCategory} tom={palette.positive} />
        </>
      )}
    </TelaRemota>
  );
}

function Categorias({
  titulo,
  itens,
  tom,
}: {
  titulo: string;
  itens: readonly CategoryBreakdown[];
  tom: string;
}) {
  const palette = usePalette();

  return (
    <Card>
      <Label style={{ marginBottom: space.xs }}>{titulo}</Label>
      {itens.length === 0 ? (
        <Empty title="Nada no período" />
      ) : (
        itens.slice(0, 8).map((item, indice) => (
          <Row
            key={item.categoryId ?? item.name}
            style={indice === Math.min(7, itens.length - 1) ? { borderBottomWidth: 0 } : undefined}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1, minWidth: 0 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: radius.pill,
                  backgroundColor: item.color || tom,
                }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Body numberOfLines={1}>{item.name}</Body>
                <Small>
                  {percent(item.percent, 1)} · {item.transactionCount} lançamento
                  {item.transactionCount === 1 ? "" : "s"}
                </Small>
              </View>
            </View>
            <Body strong style={[type.body, { color: palette.ink }]}>
              {money(cents(item.amountCents))}
            </Body>
          </Row>
        ))
      )}
    </Card>
  );
}
