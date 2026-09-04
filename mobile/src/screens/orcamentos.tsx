/**
 * Orçamentos.
 *
 * Responde uma pergunta e só ela: **quanto ainda posso gastar nisso**. É a
 * consulta que se faz de pé, dentro da loja, antes de decidir — e por isso o
 * disponível vem antes do gasto, ao contrário do site, onde há espaço para as
 * duas leituras lado a lado.
 *
 * A projeção é o que muda comportamento. O percentual sozinho só conta o que já
 * aconteceu: quem gastou 60% no dia 10 está em rota de estouro sem que nada
 * fique vermelho. "No ritmo atual você fecha em X" avisa antes.
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents } from "@fluxo/core/kernel/money.ts";
import { ApiError, OfflineError } from "../net/client.ts";
import { type BudgetLine, type BudgetsSnapshot, fetchBudgets } from "../net/budgets.ts";
import { useConnectedSession } from "../state/session.tsx";
import { money, percent } from "../ui/format.ts";
import { Medidor } from "../ui/charts.tsx";
import { Card, Empty, Label, Notice, Small, Texto } from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

export function OrcamentosScreen() {
  const palette = usePalette();
  const { credentials } = useConnectedSession();

  const [dados, setDados] = useState<BudgetsSnapshot | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [offline, setOffline] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setDados(await fetchBudgets({ baseUrl: credentials.baseUrl, token: credentials.token }));
      setOffline(false);
    } catch (problema) {
      if (problema instanceof OfflineError) setOffline(true);
      else setErro(problema instanceof ApiError ? problema.message : "Não foi possível carregar os orçamentos.");
    } finally {
      setCarregando(false);
    }
  }, [credentials]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const totais = dados?.totals;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl, gap: space.md }}
        refreshControl={
          <RefreshControl refreshing={carregando} onRefresh={() => void carregar()} tintColor={palette.accent} />
        }
      >
        <View>
          <Texto style={[type.title, { color: palette.ink }]}>Orçamentos</Texto>
          <Small style={{ marginTop: 2 }}>Quanto ainda dá para gastar em cada categoria.</Small>
        </View>

        {offline ? (
          <Notice tone="caution">
            Sem conexão. O orçamento é calculado no servidor — mostrar um número guardado seria mostrar o
            gasto de ontem como se fosse o de hoje.
          </Notice>
        ) : null}
        {erro ? <Notice tone="negative">{erro}</Notice> : null}

        {totais ? (
          <Card>
            <Label>Disponível no mês</Label>
            <Texto
              style={[
                type.figure,
                { color: totais.available > 0 ? palette.ink : palette.negative, marginTop: space.xs },
              ]}
            >
              {money(cents(totais.available))}
            </Texto>
            <Small style={{ marginTop: 2 }}>
              de {money(cents(totais.amount))} orçados · {money(cents(totais.spent))} já gastos
            </Small>

            {totais.exceededCount > 0 || totais.atRiskCount > 0 ? (
              <View style={{ marginTop: space.md }}>
                <Notice tone={totais.exceededCount > 0 ? "negative" : "caution"}>
                  {totais.exceededCount > 0
                    ? `${totais.exceededCount} categoria${totais.exceededCount > 1 ? "s" : ""} já estourou o teto.`
                    : `${totais.atRiskCount} categoria${totais.atRiskCount > 1 ? "s" : ""} em rota de estouro.`}
                </Notice>
              </View>
            ) : null}
          </Card>
        ) : null}

        {dados?.budgets.length ? (
          dados.budgets.map((linha) => <LinhaDeOrcamento key={linha.budgetId} linha={linha} />)
        ) : !carregando && !offline ? (
          <Card>
            <Empty
              title="Nenhum orçamento definido"
              hint="Defina um teto por categoria no site para acompanhar aqui quanto ainda dá para gastar."
            />
          </Card>
        ) : null}

        {dados?.uncovered.length ? (
          <Card>
            <Label>Gastando sem teto definido</Label>
            <View style={{ marginTop: space.md, gap: space.sm }}>
              {dados.uncovered.slice(0, 6).map((item) => (
                <View
                  key={item.categoryId}
                  style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: radius.pill,
                      backgroundColor: item.color ?? palette.inkSubtle,
                    }}
                  />
                  <Texto style={[type.bodySm, { color: palette.ink, flex: 1 }]} numberOfLines={1}>
                    {item.name}
                  </Texto>
                  <Texto style={[type.bodySm, { color: palette.inkMuted }]}>
                    {money(cents(item.spentCents))}
                  </Texto>
                </View>
              ))}
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function LinhaDeOrcamento({ linha }: { linha: BudgetLine }) {
  const palette = usePalette();

  const estourou = linha.available <= 0;
  const emRisco = !estourou && linha.willExceed;
  const proporcao = Math.min(100, Math.max(0, linha.percentUsed));

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1, minWidth: 0 }}>
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: radius.pill,
              backgroundColor: linha.categoryColor ?? palette.inkSubtle,
            }}
          />
          <Texto style={[type.bodyStrong, { color: palette.ink, flex: 1 }]} numberOfLines={1}>
            {linha.categoryName}
          </Texto>
        </View>

        <View style={{ alignItems: "flex-end" }}>
          {/* O disponível vem primeiro e maior: é a resposta da tela. */}
          <Texto style={[type.figureSm, { color: estourou ? palette.negative : palette.ink }]}>
            {estourou ? money(cents(0)) : money(cents(linha.available))}
          </Texto>
          <Small>disponível</Small>
        </View>
      </View>

      <View style={{ marginTop: space.md }}>
        <Medidor
          valor={linha.spent}
          total={linha.amount}
          tom={estourou ? "negative" : proporcao > 80 ? "caution" : "accent"}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: space.sm,
          gap: space.md,
        }}
      >
        <Small>
          {money(cents(linha.spent))} de {money(cents(linha.amount))}
        </Small>
        <Small tone="muted">{percent(linha.percentUsed)}</Small>
      </View>

      {emRisco || estourou ? (
        <View style={{ marginTop: space.md }}>
          <Notice tone={estourou ? "negative" : "caution"}>
            {estourou
              ? `Estourou ${money(cents(linha.spent - linha.amount))} acima do teto.`
              : `No ritmo atual você fecha o mês em ${money(cents(linha.projected))}.`}
          </Notice>
        </View>
      ) : null}
    </Card>
  );
}
