/**
 * Painel.
 *
 * Responde, nesta ordem: quanto eu tenho, quanto disso já tem dono, quanto
 * sobra. As três nunca aparecem somadas — foi juntar "saldo" com "limite
 * disponível" que fez a versão anterior mostrar dinheiro que não existia.
 *
 * Nenhum número é calculado aqui. Todos vêm de `useLedger`, que os deriva com
 * o mesmo domínio que o site usa.
 */

import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { competenceOf } from "@fluxo/core/time/competence.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import { useLedger } from "../state/ledger.tsx";
import { useConnectedSession } from "../state/session.tsx";
import { competence as formatCompetence, money, relativeDate } from "../ui/format.ts";
import { Body, Card, Divider, Empty, Figure, Label, Notice, Row, Small } from "../ui/primitives.tsx";
import { space, usePalette } from "../ui/theme.ts";

export function InicioScreen({ onOpenTransaction }: { onOpenTransaction: (id: string) => void }) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const { overview, transactions, sync, synchronize } = useLedger();

  const hoje = todayIn();
  const recentes = transactions.filter((item) => item.occurredOn <= hoje).slice(0, 8);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl refreshing={sync.running} onRefresh={() => void synchronize()} tintColor={palette.accent} />
        }
      >
        <View style={{ gap: 2 }}>
          <Small>Olá, {credentials.user.displayName.split(" ")[0]}</Small>
          <Body strong>{formatCompetence(competenceOf(hoje))}</Body>
        </View>

        {sync.offline ? (
          <Notice tone="caution">
            Sem conexão. Os lançamentos ficam salvos aqui e sobem quando a rede voltar.
          </Notice>
        ) : null}

        {sync.pending > 0 ? (
          <Notice tone="info">
            {sync.pending === 1 ? "1 lançamento aguardando envio." : `${sync.pending} lançamentos aguardando envio.`}
          </Notice>
        ) : null}

        {sync.unresolved > 0 ? (
          <Notice tone="negative">
            {sync.unresolved === 1
              ? "1 alteração precisa da sua decisão. Veja em Ajustes."
              : `${sync.unresolved} alterações precisam da sua decisão. Veja em Ajustes.`}
          </Notice>
        ) : null}

        <Card>
          <Label>Saldo em conta</Label>
          <View style={{ marginTop: space.xs }}>
            <Figure tone={overview && overview.balance < 0 ? "negative" : "neutral"}>
              {overview ? money(overview.balance) : "—"}
            </Figure>
          </View>

          <View style={{ flexDirection: "row", gap: space.lg, marginTop: space.lg }}>
            <View style={{ flex: 1 }}>
              <Label>Comprometido</Label>
              <Body strong style={{ marginTop: 2 }}>
                {overview ? money(overview.committed) : "—"}
              </Body>
              <Small>faturas em aberto</Small>
            </View>

            <View style={{ flex: 1 }}>
              <Label>Livre para gastar</Label>
              <Body
                strong
                style={{ marginTop: 2, color: overview && overview.free < 0 ? palette.negative : palette.ink }}
              >
                {overview ? money(overview.free) : "—"}
              </Body>
              <Small>saldo menos faturas</Small>
            </View>
          </View>
        </Card>

        <Card>
          <Label>Mês corrente</Label>
          <View style={{ flexDirection: "row", gap: space.lg, marginTop: space.sm }}>
            <View style={{ flex: 1 }}>
              <Small tone="positive">Entrou</Small>
              <Body strong>{overview ? money(overview.income) : "—"}</Body>
            </View>
            <View style={{ flex: 1 }}>
              <Small tone="negative">Saiu</Small>
              <Body strong>{overview ? money(overview.expense) : "—"}</Body>
            </View>
          </View>
        </Card>

        {overview?.cards.length ? (
          <Card>
            <Label>Cartões</Label>
            <View style={{ marginTop: space.sm }}>
              {overview.cards.map((resumo) => (
                <Row key={resumo.card.id}>
                  <View style={{ flex: 1 }}>
                    <Body strong numberOfLines={1}>
                      {resumo.card.name}
                    </Body>
                    <Small>
                      fatura {formatCompetence(resumo.competence)} · vence {relativeDate(resumo.dueDate, hoje)}
                      {resumo.daysToClosing >= 0 ? ` · fecha em ${resumo.daysToClosing}d` : ""}
                    </Small>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Body strong>{money(resumo.outstanding)}</Body>
                    {resumo.available === null ? (
                      <Small>limite não cadastrado</Small>
                    ) : (
                      <Small>{money(resumo.available)} livres</Small>
                    )}
                  </View>
                </Row>
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <Label>Últimos lançamentos</Label>
          <View style={{ marginTop: space.sm }}>
            {recentes.length ? (
              recentes.map((item) => (
                <Row key={item.id} onPress={() => onOpenTransaction(item.id)}>
                  <View style={{ flex: 1 }}>
                    <Body numberOfLines={1}>{item.description}</Body>
                    <Small>{relativeDate(item.occurredOn, hoje)}</Small>
                  </View>
                  <Body strong style={{ color: item.kind === "income" ? palette.positive : palette.ink }}>
                    {item.kind === "income" ? "+ " : "− "}
                    {money(item.amount)}
                  </Body>
                </Row>
              ))
            ) : (
              <Empty title="Nada por aqui ainda" hint="Toque em Novo para registrar o primeiro lançamento." />
            )}
          </View>
        </Card>

        {overview && overview.skipped > 0 ? (
          <>
            <Divider />
            <Small tone="caution">
              {overview.skipped} lançamento(s) não puderam ser calculados e ficaram de fora destes números.
            </Small>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
