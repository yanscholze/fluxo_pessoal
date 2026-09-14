/**
 * Saúde financeira.
 *
 * O diagnóstico, não o extrato. A pergunta aqui não é "quanto tenho" — o Início
 * já responde isso — e sim "estou bem?". Por isso os sinais vêm primeiro, em
 * texto, e os números depois: um percentual de comprometimento sozinho não diz
 * a ninguém se está bom ou ruim, e é justamente esse julgamento que o servidor
 * já faz e que valia trazer para o bolso.
 *
 * A reserva de emergência aparece em **meses cobertos**, não só em reais. Saber
 * que se tem R$ 8.000 guardados não responde nada; saber que isso paga três
 * meses de vida responde tudo.
 */

import { View } from "react-native";

import { cents } from "@fluxo/core/kernel/money.ts";
import { fetchHealth, type HealthSignal } from "../net/views.ts";
import { useRemoto } from "../state/remote.tsx";
import { Medidor } from "../ui/charts.tsx";
import { money, percent, relativeDate } from "../ui/format.ts";
import { Body, Card, Empty, Figure, Label, Row, Small } from "../ui/primitives.tsx";
import { TelaRemota } from "../ui/tela-remota.tsx";
import { radius, space, usePalette } from "../ui/theme.ts";

const TOM: Record<HealthSignal["status"], "positive" | "caution" | "negative"> = {
  bom: "positive",
  atencao: "caution",
  critico: "negative",
};

export function SaudeScreen({ onVoltar }: { onVoltar?: () => void }) {
  const palette = usePalette();
  const remoto = useRemoto(fetchHealth);

  return (
    <TelaRemota
      titulo="Saúde financeira"
      descricao="O diagnóstico, não o saldo."
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
            <Small style={{ marginTop: 4 }}>
              Livre para gastar hoje: {money(cents(dados.freeToSpendCents))}
            </Small>
          </Card>

          {/* Os sinais primeiro: é o julgamento que o número sozinho não dá. */}
          <Card>
            <Label style={{ marginBottom: space.sm }}>Sinais</Label>
            {dados.signals.length === 0 ? (
              <Empty title="Sem sinais" hint="Nada exigindo atenção agora." />
            ) : (
              dados.signals.map((sinal) => (
                <View
                  key={sinal.key}
                  style={{ flexDirection: "row", gap: space.sm, paddingVertical: space.sm }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 6,
                      marginTop: 7,
                      borderRadius: radius.pill,
                      backgroundColor:
                        sinal.status === "bom"
                          ? palette.positive
                          : sinal.status === "atencao"
                            ? palette.caution
                            : palette.negative,
                    }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body strong>{sinal.title}</Body>
                    <Small style={{ marginTop: 2 }}>{sinal.detail}</Small>
                  </View>
                </View>
              ))
            )}
          </Card>

          <Card>
            <Label>Reserva de emergência</Label>
            <Figure small>{money(cents(dados.reserve.currentCents))}</Figure>
            <Small style={{ marginTop: 2, marginBottom: space.sm }}>
              {dados.reserve.monthsCovered.toFixed(1)} meses cobertos · alvo{" "}
              {money(cents(dados.reserve.targetCents))}
            </Small>
            <Medidor
              valor={Math.min(100, dados.reserve.percent)}
              total={100}
              tom={dados.reserve.percent >= 100 ? "positive" : "accent"}
            />
          </Card>

          <Card>
            <Label style={{ marginBottom: space.xs }}>Compromisso e dívida</Label>
            <Row>
              <Body muted>Renda comprometida</Body>
              <Body strong>{percent(dados.commitment.percent)}</Body>
            </Row>
            <Row>
              <Body muted>Guardado da renda</Body>
              <Body strong>{percent(dados.savingsRatePercent)}</Body>
            </Row>
            <Row>
              <Body muted>Dívida no cartão</Body>
              <Body strong>{money(cents(dados.debts.cardDebtCents))}</Body>
            </Row>
            <Row style={{ borderBottomWidth: 0 }}>
              <Body muted>Parcelamentos em aberto</Body>
              <Body strong>{money(cents(dados.debts.openInstallmentsCents))}</Body>
            </Row>
            {dados.debts.overdueInvoices > 0 ? (
              <Small tone="negative" style={{ marginTop: space.sm }}>
                {dados.debts.overdueInvoices} fatura
                {dados.debts.overdueInvoices > 1 ? "s" : ""} em atraso.
              </Small>
            ) : null}
          </Card>

          <Card>
            <Label style={{ marginBottom: space.xs }}>Próximos 30 dias</Label>
            {dados.agenda.length === 0 ? (
              <Empty title="Nada marcado" hint="Nenhum vencimento no horizonte." />
            ) : (
              dados.agenda.slice(0, 12).map((evento, indice) => (
                <Row key={`${evento.date}-${indice}`} style={indice === dados.agenda.length - 1 ? { borderBottomWidth: 0 } : undefined}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body numberOfLines={1}>{evento.description}</Body>
                    <Small>{relativeDate(evento.date as never)}</Small>
                  </View>
                  <Body strong style={{ color: evento.direction === "in" ? palette.positive : palette.ink }}>
                    {evento.direction === "in" ? "+" : "−"}
                    {money(cents(Math.abs(evento.amountCents)))}
                  </Body>
                </Row>
              ))
            )}
          </Card>
        </>
      )}
    </TelaRemota>
  );
}
