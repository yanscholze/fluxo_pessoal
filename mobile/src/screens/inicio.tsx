/**
 * Painel.
 *
 * A tela responde de cima para baixo, na ordem em que as perguntas aparecem:
 * quanto sobra, quanto existe, para onde está indo, o que vence, o que saiu.
 *
 * O primeiro bloco é o único com destaque — número grande, superfície própria,
 * cor. Todo o resto recua. Foi tentando dar destaque a tudo que a versão
 * anterior virou uma pilha de cartões iguais em que nada saltava: com oito
 * caixas idênticas, a leitura vira busca.
 *
 * Nenhum número é calculado aqui, e nenhum é derivado no aparelho.
 *
 * Antes eram derivados do razão sincronizado, chamando a mesma função de
 * domínio que o site chama. Mesma função, entradas diferentes: o sync carrega
 * lançamento e mais nada, então o aparelho não sabia quais categorias ficam
 * fora da folga nem que o vale é bolso à parte. O site dizia R$ 951,27 e o
 * celular dizia -R$ 2.556,47 para o mesmo dinheiro, no mesmo dia — e o usuário
 * não tinha como saber qual acreditar.
 *
 * Agora o painel é o do servidor, o mesmo que o site desenha. O razão local
 * continua servindo para o extrato sem rede e para enfileirar lançamento
 * offline; a **conta** vem de um lugar só.
 */

import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { competenceOf, formatShort } from "@fluxo/core/time/competence.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import { type Cents, cents } from "@fluxo/core/kernel/money.ts";
import { fetchDashboard } from "../net/views.ts";
import { useLedger } from "../state/ledger.tsx";
import { useRemoto } from "../state/remote.tsx";
import { useConnectedSession } from "../state/session.tsx";
import { FaixaDeIndicadores, GraficoDeCategorias, GraficoMensal, Sparkbars } from "../ui/charts.tsx";
import { competence as formatCompetence, money, relativeDate } from "../ui/format.ts";
import { Card, Empty, Label, Notice, Small, Texto } from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

export function InicioScreen({
  onOpenTransaction,
  onAbrirAjustes,
}: {
  onOpenTransaction: (id: string) => void;
  onAbrirAjustes: () => void;
}) {
  const palette = usePalette();
  const { credentials } = useConnectedSession();
  const { charts, transactions, sync, synchronize } = useLedger();
  const painel = useRemoto(fetchDashboard);
  const dados = painel.dados;

  const hoje = todayIn();
  const competencia = competenceOf(hoje);
  const recentes = transactions.filter((item) => item.occurredOn <= hoje).slice(0, 6);

  const aVencer = (dados?.cards ?? [])
    .filter((cartao) => (cartao.currentInvoice?.outstandingCents ?? 0) > 0)
    .sort((esquerda, direita) =>
      (esquerda.currentInvoice?.dueDate ?? "").localeCompare(direita.currentInvoice?.dueDate ?? ""),
    );

  const negativo = dados !== null && dados.freeToSpend.amountCents < 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={[]}>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl * 2 }}
        refreshControl={
          <RefreshControl
            refreshing={sync.running || painel.carregando}
            onRefresh={() => {
              void synchronize();
              painel.recarregar();
            }}
            tintColor={palette.accent}
          />
        }
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ gap: 2 }}>
            <Texto style={[type.title, { color: palette.ink }]}>
              Olá, {credentials.user.displayName.split(" ")[0]}
            </Texto>
            <Small>{formatCompetence(competencia)}</Small>
          </View>

          {/* Ajustes saiu da barra de abas: é visitado uma vez por mês, e
              ocupava um quarto da navegação permanente por isso. */}
          <Pressable
            onPress={onAbrirAjustes}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Ajustes"
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: radius.pill,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: palette.surfaceSunken,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Texto style={[type.body, { color: palette.inkMuted }]}>⚙</Texto>
            {sync.unresolved > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 7,
                  height: 7,
                  borderRadius: radius.pill,
                  backgroundColor: palette.caution,
                }}
              />
            ) : null}
          </Pressable>
        </View>

        {sync.offline || painel.offline ? (
          <Notice tone="caution">
            Sem conexão. Os lançamentos ficam salvos aqui e sobem quando a rede voltar — mas os
            números acima são calculados no servidor, e sem alcançá-lo eles ficam em branco em vez
            de mostrar uma conta que talvez já não valha.
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

        {/*
          O único bloco com superfície própria e cor.
          A pergunta principal, sozinha, no tamanho que não deixa dúvida.
        */}
        <View
          style={{
            backgroundColor: negativo ? palette.negativeWash : palette.accentWash,
            borderWidth: 1,
            borderColor: negativo ? palette.negative + "40" : palette.accentEdge,
            borderRadius: radius.xl,
            padding: space.lg,
          }}
        >
          <Label>Livre para gastar</Label>
          <Texto
            style={[
              type.display,
              { color: negativo ? palette.negative : palette.ink, marginTop: space.xs },
            ]}
          >
            {dados ? money(cents(dados.freeToSpend.amountCents)) : "—"}
          </Texto>
          <Small style={{ marginTop: space.xs }}>
            {negativo
              ? "Os compromissos assumidos passam do que você tem."
              : "Quanto pode sair hoje sem furar nenhum compromisso."}
          </Small>

          <FaixaDeIndicadores>
            <View style={{ flex: 1 }}>
              <Label>Em conta</Label>
              <Texto style={[type.figureSm, { color: palette.ink, marginTop: 2 }]}>
                {dados ? money(cents(dados.freeToSpend.liquidBalanceCents)) : "—"}
              </Texto>
            </View>
            <View
              style={{ width: 1, backgroundColor: palette.line, marginHorizontal: space.md }}
            />
            <View style={{ flex: 1 }}>
              <Label>Faturas em aberto</Label>
              <Texto style={[type.figureSm, { color: palette.inkMuted, marginTop: 2 }]}>
                {dados ? money(cents(dados.freeToSpend.openInvoicesCents)) : "—"}
              </Texto>
            </View>
          </FaixaDeIndicadores>

          {/*
            A folga não é a soma das linhas acima, e a tela precisa dizer isso.
            Mostrar parcelas que não fecham com o total é pior do que não
            mostrar nada — o usuário confere, não bate, e para de confiar.
          */}
          {dados ? (
            <>
              <Small style={{ marginTop: space.md }}>
                Medido no dia mais apertado até {relativeDate(dados.freeToSpend.horizonEnd as never)}
                {dados.freeToSpend.pendingIncomeCents > 0
                  ? ` · ${money(cents(dados.freeToSpend.pendingIncomeCents))} a receber no período`
                  : ""}
              </Small>
              {/* O vale ao lado, nunca somado: ele compra comida e nada mais. */}
              {dados.benefitFreeToSpend ? (
                <Small style={{ marginTop: 4 }}>
                  e mais {money(cents(dados.benefitFreeToSpend.amountCents))} em vale-alimentação
                </Small>
              ) : null}
            </>
          ) : null}
        </View>

        {charts.balanceDays.length > 1 ? (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
              <View>
                <Label>Saldo nos últimos 30 dias</Label>
                <Small style={{ marginTop: 2 }}>
                  {(() => {
                    const inicio = charts.balanceDays[0];
                    const fim = charts.balanceDays[charts.balanceDays.length - 1];
                    const delta = fim - inicio;
                    return delta === 0
                      ? "sem variação no período"
                      : `${delta > 0 ? "+" : "−"} ${money(cents(Math.abs(delta)))} no período`;
                  })()}
                </Small>
              </View>
            </View>
            <View style={{ marginTop: space.md }}>
              <Sparkbars
                valores={charts.balanceDays}
                cor={
                  charts.balanceDays[charts.balanceDays.length - 1] >= charts.balanceDays[0]
                    ? palette.positive
                    : palette.negative
                }
              />
            </View>
          </Card>
        ) : null}

        <Card>
          <Label>Entrou e saiu</Label>
          <Small style={{ marginTop: 2, marginBottom: space.md }}>Últimos seis meses</Small>

          <GraficoMensal
            barras={charts.monthly.map((ponto) => ({
              rotulo: formatShort(ponto.competence).replace(/\.$/, ""),
              entrada: ponto.income,
              saida: ponto.expense,
              atual: ponto.competence === competencia,
            }))}
          />

          <FaixaDeIndicadores>
            <View style={{ flex: 1 }}>
              <Small tone="positive">Entrou este mês</Small>
              <Texto style={[type.bodyStrong, { color: palette.ink, marginTop: 2 }]}>
                {dados ? money(cents(dados.monthFlow.incomeCents)) : "—"}
              </Texto>
            </View>
            <View style={{ flex: 1 }}>
              <Small tone="negative">Saiu este mês</Small>
              <Texto style={[type.bodyStrong, { color: palette.ink, marginTop: 2 }]}>
                {dados ? money(cents(dados.monthFlow.expenseCents)) : "—"}
              </Texto>
            </View>
          </FaixaDeIndicadores>
        </Card>

        {charts.byCategory.length ? (
          <Card>
            <Label>Para onde foi</Label>
            <Small style={{ marginTop: 2, marginBottom: space.md }}>Gastos da competência</Small>
            <GraficoDeCategorias
              fatias={charts.byCategory.map((item, indice) => ({
                id: item.categoryId ?? `sem-${indice}`,
                rotulo: item.name,
                valor: item.amount,
                cor: item.color ?? palette.viz[indice % palette.viz.length],
              }))}
            />
          </Card>
        ) : null}

        {aVencer.length ? (
          <Card>
            <Label>Faturas em aberto</Label>
            <View style={{ gap: space.md, marginTop: space.md }}>
              {aVencer.map((cartao) => (
                <View key={cartao.id} style={{ gap: space.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                    <Texto style={[type.body, { flex: 1, color: palette.ink }]} numberOfLines={1}>
                      {cartao.name}
                    </Texto>
                    <Texto style={[type.bodyStrong, { color: palette.ink }]}>
                      {money(cents(cartao.currentInvoice?.outstandingCents ?? 0))}
                    </Texto>
                  </View>
                  <Small>
                    vence {relativeDate((cartao.currentInvoice?.dueDate ?? "") as never)} · fecha em{" "}
                    {cartao.daysUntilClosing} dia{cartao.daysUntilClosing === 1 ? "" : "s"}
                  </Small>
                </View>
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          <Label>Últimos lançamentos</Label>
          {recentes.length ? (
            <View style={{ marginTop: space.sm }}>
              {recentes.map((item, indice) => (
                <LinhaCompacta
                  key={item.id}
                  descricao={item.description}
                  quando={relativeDate(item.occurredOn)}
                  valor={item.amount}
                  entrada={item.kind === "income"}
                  previsto={item.state === "planned"}
                  primeira={indice === 0}
                  onPress={() => onOpenTransaction(item.id)}
                />
              ))}
            </View>
          ) : (
            <View style={{ marginTop: space.sm }}>
              <Empty
                title="Nenhum lançamento ainda"
                hint="Toque no botão de mais para registrar o primeiro."
              />
            </View>
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Linha do resumo.
 *
 * Mais enxuta que a do extrato de propósito: aqui a pergunta é "o que aconteceu
 * por último", não "onde caiu e em que categoria". Repetir as seis colunas do
 * extrato dentro de um cartão de resumo é o tipo de excesso que faz um painel
 * parecer uma planilha.
 */
function LinhaCompacta({
  descricao,
  quando,
  valor,
  entrada,
  previsto,
  primeira,
  onPress,
}: {
  descricao: string;
  quando: string;
  valor: Cents;
  entrada: boolean;
  previsto: boolean;
  primeira: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();

  return (
    <Pressable
      onPress={onPress}
      // O alvo tem 44 px de altura mínima: é o que um polegar acerta sem mirar.
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        minHeight: 44,
        paddingVertical: space.sm + 2,
        borderTopWidth: primeira ? 0 : 1,
        borderTopColor: palette.line,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: radius.pill,
          backgroundColor: entrada ? palette.positive : previsto ? palette.inkSubtle : palette.negative,
        }}
      />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Texto
          style={[type.body, { color: previsto ? palette.inkMuted : palette.ink }]}
          numberOfLines={1}
        >
          {descricao}
        </Texto>
        <Small style={{ marginTop: 1 }}>
          {quando}
          {previsto ? " · previsto" : ""}
        </Small>
      </View>

      <Texto
        style={[
          type.bodyStrong,
          { color: entrada ? palette.positive : previsto ? palette.inkMuted : palette.ink },
        ]}
      >
        {entrada ? "+ " : "− "}
        {money(valor)}
      </Texto>
    </Pressable>
  );
}
