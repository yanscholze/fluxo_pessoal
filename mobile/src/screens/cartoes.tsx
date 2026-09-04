/**
 * Cartões e faturas.
 *
 * A consulta de bolso mais comum do produto: quanto devo, quando vence, quanto
 * de limite sobrou. É a tela que se abre na fila do caixa, e por isso a
 * resposta tem que caber antes de qualquer rolagem.
 *
 * Arrastar para o lado troca o cartão — a mesma interação do site, aqui com
 * `pagingEnabled` nativo, que no celular é gesto de verdade e não simulação.
 *
 * Tudo vem do razão local, derivado pelo mesmo domínio que o servidor usa.
 * Funciona sem rede.
 */

import { useRef, useState } from "react";
import { RefreshControl, ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { cents } from "@fluxo/core/kernel/money.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import type { CardSummary } from "../finance/derive.ts";
import { useLedger } from "../state/ledger.tsx";
import { CardFace, LARGURA_DA_FACE } from "../ui/card-face.tsx";
import { competence as formatCompetence, money, relativeDate } from "../ui/format.ts";
import { Medidor } from "../ui/charts.tsx";
import { Body, Card, Empty, Label, Notice, Small, Texto } from "../ui/primitives.tsx";
import { radius, space, type, usePalette } from "../ui/theme.ts";

const ESPACO_ENTRE_FACES = space.md;
const PASSO = LARGURA_DA_FACE + ESPACO_ENTRE_FACES;

export function CartoesScreen() {
  const palette = usePalette();
  const { overview, sync, synchronize } = useLedger();
  const [ativo, setAtivo] = useState(0);
  const trilho = useRef<ScrollView>(null);

  const hoje = todayIn();
  const cartoes = overview?.cards ?? [];
  const credito = cartoes.filter((resumo) => resumo.card.kind === "credit");

  // O cartão ativo sai da posição da rolagem, e não de um toque: assim o
  // arrasto e o indicador nunca discordam sobre qual cartão está na frente.
  function aoRolar(evento: NativeSyntheticEvent<NativeScrollEvent>) {
    const indice = Math.round(evento.nativeEvent.contentOffset.x / PASSO);
    setAtivo((atual) => (atual === indice ? atual : Math.max(0, Math.min(indice, cartoes.length - 1))));
  }

  const selecionado = cartoes[Math.min(ativo, Math.max(0, cartoes.length - 1))];

  const limite = cents(credito.reduce<number>((soma, item) => soma + item.card.limit, 0));
  const disponivel = cents(credito.reduce<number>((soma, item) => soma + (item.available ?? 0), 0));
  const emAberto = cents(credito.reduce<number>((soma, item) => soma + item.outstanding, 0));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.canvas }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingVertical: space.lg, paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl refreshing={sync.running} onRefresh={() => void synchronize()} tintColor={palette.accent} />
        }
      >
        <View style={{ paddingHorizontal: space.lg }}>
          <Texto style={[type.title, { color: palette.ink }]}>Cartões</Texto>
          <Small style={{ marginTop: 2 }}>Fatura em aberto, fechamento e limite disponível.</Small>
        </View>

        {cartoes.length === 0 ? (
          <View style={{ padding: space.lg }}>
            <Card>
              <Empty
                title="Nenhum cartão cadastrado"
                hint="Cadastre um cartão no site para acompanhar competência, fatura e limite aqui."
              />
            </Card>
          </View>
        ) : (
          <>
            <ScrollView
              ref={trilho}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={PASSO}
              decelerationRate="fast"
              onScroll={aoRolar}
              scrollEventThrottle={32}
              contentContainerStyle={{
                paddingHorizontal: space.lg,
                gap: ESPACO_ENTRE_FACES,
                paddingVertical: space.lg,
              }}
            >
              {cartoes.map((resumo, indice) => (
                <CardFace
                  key={resumo.card.id}
                  resumo={resumo}
                  hoje={hoje}
                  atenuada={cartoes.length > 1 && indice !== ativo}
                />
              ))}
            </ScrollView>

            {cartoes.length > 1 ? (
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: space.lg }}>
                {cartoes.map((resumo, indice) => (
                  <View
                    key={resumo.card.id}
                    style={{
                      height: 6,
                      width: indice === ativo ? 20 : 6,
                      borderRadius: radius.pill,
                      backgroundColor: indice === ativo ? palette.accent : palette.lineStrong,
                    }}
                  />
                ))}
              </View>
            ) : null}

            {selecionado ? <DetalheDoCartao resumo={selecionado} hoje={hoje} /> : null}

            {credito.length > 1 ? (
              <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
                <Card>
                  <Label>Somando os cartões de crédito</Label>
                  <View style={{ marginTop: space.md, gap: space.sm }}>
                    <Linha rotulo="Faturas em aberto" valor={money(emAberto)} />
                    <Linha rotulo="Limite total" valor={money(limite)} />
                    <Linha rotulo="Disponível" valor={money(disponivel)} tom={palette.positive} />
                  </View>
                </Card>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetalheDoCartao({ resumo, hoje }: { resumo: CardSummary; hoje: string }) {
  const palette = usePalette();
  const { card } = resumo;

  if (card.kind !== "credit") {
    return (
      <View style={{ paddingHorizontal: space.lg }}>
        <Card>
          <Body muted>
            Cartão de débito: cada compra sai direto do saldo da conta, sem fatura e sem limite próprio.
          </Body>
        </Card>
      </View>
    );
  }

  const usado = cents(card.limit > 0 ? card.limit - (resumo.available ?? 0) : 0);
  const proporcao = card.limit > 0 ? usado / card.limit : 0;
  const fecha = resumo.daysToClosing;

  return (
    <View style={{ paddingHorizontal: space.lg, gap: space.md }}>
      <Card>
        <Label>Fatura de {formatCompetence(resumo.competence)}</Label>
        <Texto style={[type.figure, { color: palette.ink, marginTop: space.xs }]}>
          {money(resumo.outstanding)}
        </Texto>

        {resumo.payments > 0 ? (
          <Small style={{ marginTop: 2 }}>
            {money(resumo.payments)} pagos de {money(resumo.charges)}
          </Small>
        ) : null}

        <View style={{ marginTop: space.md, gap: space.sm }}>
          <Linha
            rotulo="Fecha"
            valor={fecha >= 0 ? `em ${fecha} dia${fecha === 1 ? "" : "s"}` : "já fechou"}
          />
          <Linha rotulo="Vence" valor={relativeDate(resumo.dueDate, hoje as never)} />
        </View>

        {/* A regra que mais gera surpresa no crédito: o que passa do fechamento
            entra na fatura seguinte, não nesta. */}
        {fecha >= 0 && fecha <= 3 ? (
          <View style={{ marginTop: space.md }}>
            <Notice tone="caution">
              A fatura fecha em {fecha === 0 ? "hoje" : `${fecha} dia${fecha === 1 ? "" : "s"}`}. Compra feita
              depois disso entra na competência seguinte.
            </Notice>
          </View>
        ) : null}
      </Card>

      {card.limit > 0 ? (
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
            <Label>Limite comprometido</Label>
            <Small tone="muted">
              {money(usado)} de {money(card.limit)}
            </Small>
          </View>

          <View style={{ marginTop: space.sm }}>
            <Medidor
              valor={usado}
              total={card.limit}
              tom={proporcao > 0.85 ? "negative" : proporcao > 0.6 ? "caution" : "accent"}
            />
          </View>

          <Small style={{ marginTop: space.sm }}>
            {resumo.available === null
              ? "Limite não cadastrado"
              : `${money(resumo.available)} livres · inclui parcelas futuras`}
          </Small>
        </Card>
      ) : null}

      {resumo.debt > resumo.outstanding ? (
        <Card>
          <Label>Dívida total do cartão</Label>
          <Texto style={[type.figureSm, { color: palette.ink, marginTop: space.xs }]}>
            {money(resumo.debt)}
          </Texto>
          <Small style={{ marginTop: 2 }}>
            Soma de todas as competências em aberto, não só a atual.
          </Small>
        </Card>
      ) : null}
    </View>
  );
}

function Linha({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  const palette = usePalette();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.md }}>
      <Texto style={[type.bodySm, { color: palette.inkMuted }]}>{rotulo}</Texto>
      <Texto style={[type.bodySm, { color: tom ?? palette.ink, fontWeight: "600" }]}>{valor}</Texto>
    </View>
  );
}
