import { redirect } from "next/navigation";

import { buildHealthView } from "../../../server/services/health.ts";
import { currentUser } from "../../auth-context.ts";
import { KeyValue, MetricStrip, Timeline, type TimelineItem } from "../../ui/data-display.tsx";
import { date, decimal, money, percent, relativeDay } from "../../ui/format.ts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CreditCard,
  PiggyBank,
  Repeat,
  ShieldCheck,
  Wallet,
} from "../../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../../ui/page-frame.tsx";
import { Empty, Meter, Panel, PanelHeader, StatusDot, type Tone } from "../../ui/primitives.tsx";

export const dynamic = "force-dynamic";

const SINAL: Record<"bom" | "atencao" | "critico", { tom: Tone; texto: string }> = {
  bom: { tom: "positive", texto: "saudável" },
  atencao: { tom: "caution", texto: "atenção" },
  critico: { tom: "negative", texto: "crítico" },
};

const EVENTO: Record<string, string> = {
  recorrencia: "Recorrência",
  fatura: "Fatura",
  parcela: "Parcela",
  previsto: "Previsto",
};

/**
 * Saúde financeira.
 *
 * Painel de diagnóstico, e não uma nota de 0 a 100. Uma nota agregada esconde
 * exatamente a informação que resolve o problema: se a reserva está curta ou se
 * o cartão está estourado, dá a mesma nota — e nenhuma das duas se conserta do
 * mesmo jeito. Aqui cada indicador se explica e diz o que fazer.
 *
 * A agenda fecha a tela porque é a parte acionável: saber que a renda está 70%
 * comprometida importa menos do que saber o que vence na quinta.
 */
export default async function Saude() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildHealthView(user.id);
  const criticos = view.signals.filter((sinal) => sinal.status === "critico").length;
  const atencao = view.signals.filter((sinal) => sinal.status === "atencao").length;

  const agenda: TimelineItem[] = view.agenda.map((evento, indice) => ({
    id: `${evento.date}-${evento.description}-${indice}`,
    when: `${date(evento.date)} · ${relativeDay(evento.date, view.today)}`,
    title: evento.description,
    detail: EVENTO[evento.kind] ?? evento.kind,
    value: `${evento.direction === "in" ? "+ " : "− "}${money(evento.amountCents)}`,
    valueTone: evento.direction === "in" ? "positive" : "neutral",
    tone: evento.direction === "in" ? "positive" : "negative",
    icon: evento.direction === "in" ? ArrowUpRight : ArrowDownRight,
    isNow: evento.date === view.today,
  }));

  return (
    <Page>
      <PageHeader
        title="Saúde financeira"
        description={
          criticos > 0
            ? `${criticos} ${criticos === 1 ? "ponto pede" : "pontos pedem"} atenção agora.`
            : atencao > 0
              ? `${atencao} ${atencao === 1 ? "ponto merece" : "pontos merecem"} acompanhamento.`
              : "Diagnóstico a partir dos seus números, não de regra genérica."
        }
      />

      <Stack gap="lg">
        <MetricStrip
          metrics={[
            {
              label: "Livre para gastar",
              value: money(view.freeToSpendCents),
              tone: view.freeToSpendCents < 0 ? "negative" : "positive",
              icon: Wallet,
              hint: "Depois de honrar tudo que já está assumido",
            },
            {
              label: "Taxa de poupança",
              value: percent(view.savingsRatePercent),
              tone:
                view.savingsRatePercent < 0
                  ? "negative"
                  : view.savingsRatePercent >= 20
                    ? "positive"
                    : "caution",
              icon: PiggyBank,
              hint: `de ${money(view.commitment.monthlyIncomeCents)} que entraram no mês`,
            },
            {
              label: "Renda comprometida",
              value: percent(view.commitment.percent),
              tone:
                view.commitment.percent > 75
                  ? "negative"
                  : view.commitment.percent > 50
                    ? "caution"
                    : "positive",
              icon: Repeat,
              hint: `${money(view.commitment.committedCents)} já com destino`,
            },
            {
              label: "Patrimônio",
              value: money(view.netWorthCents),
              tone: view.netWorthCents < 0 ? "negative" : "neutral",
              icon: ShieldCheck,
              hint: "Ativos menos dívidas",
            },
          ]}
        />

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Panel>
              <PanelHeader
                title="Diagnóstico"
                icon={ShieldCheck}
                hint="Cada sinal olha um aspecto e diz o que ele significa hoje"
              />
              <ul className="space-y-3">
                {view.signals.map((sinal) => {
                  const situacao = SINAL[sinal.status];
                  return (
                    <li
                      key={sinal.key}
                      className="flex items-start gap-3 border-b border-line pb-3 last:border-0 last:pb-0"
                    >
                      <span className="mt-1.5">
                        <StatusDot tone={situacao.tom} label={situacao.texto} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <p className="text-body font-medium text-ink">{sinal.title}</p>
                          <p className={`text-caption font-medium ${situacao.tom === "positive" ? "text-positive" : situacao.tom === "caution" ? "text-caution" : "text-negative"}`}>
                            {situacao.texto}
                          </p>
                        </div>
                        <p className="mt-0.5 text-body-sm text-ink-muted">{sinal.detail}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>

            <Panel>
              <PanelHeader
                title="Reserva de emergência"
                icon={PiggyBank}
                hint="Alvo: seis meses de gasto essencial"
              />
              {view.reserve.monthlyEssentialCents > 0 ? (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="tabular text-figure text-ink">{money(view.reserve.currentCents)}</p>
                      <p className="mt-1 text-caption text-ink-subtle">
                        de {money(view.reserve.targetCents)} · cobre {decimal(view.reserve.monthsCovered)} meses
                      </p>
                    </div>
                    <p className="tabular text-figure-sm text-ink">{percent(view.reserve.percent)}</p>
                  </div>
                  <div className="mt-3">
                    <Meter
                      value={view.reserve.currentCents}
                      total={view.reserve.targetCents}
                      tone={
                        view.reserve.monthsCovered >= 6
                          ? "positive"
                          : view.reserve.monthsCovered >= 3
                            ? "caution"
                            : "negative"
                      }
                      label="Reserva de emergência"
                    />
                  </div>
                  <p className="mt-2 text-caption text-ink-subtle">
                    Gasto essencial médio: {money(view.reserve.monthlyEssentialCents)} por mês
                  </p>
                </>
              ) : (
                <Empty
                  icon={PiggyBank}
                  title="Nenhuma categoria marcada como essencial"
                  hint="Marque moradia, alimentação e transporte como essenciais para o Fluxo calcular o alvo da reserva."
                  compact
                />
              )}
            </Panel>
          </div>

          <div className="space-y-5">
            <Panel>
              <PanelHeader title="Dívidas" icon={CreditCard} />
              <KeyValue
                columns={1}
                entries={[
                  {
                    label: "Fatura de cartão",
                    value: <span className="tabular">{money(view.debts.cardDebtCents)}</span>,
                  },
                  {
                    label: "Parcelas a vencer",
                    value: <span className="tabular">{money(view.debts.openInstallmentsCents)}</span>,
                  },
                  {
                    label: "Faturas em atraso",
                    value: (
                      <span
                        className={`tabular ${view.debts.overdueInvoices > 0 ? "font-medium text-negative" : ""}`}
                      >
                        {view.debts.overdueInvoices}
                      </span>
                    ),
                  },
                ]}
              />
            </Panel>

            <Panel>
              <PanelHeader title="Próximos 30 dias" icon={Calendar} />
              {agenda.length ? (
                <Timeline items={agenda} />
              ) : (
                <Empty icon={Calendar} title="Nada previsto nos próximos 30 dias" compact />
              )}
            </Panel>
          </div>
        </div>
      </Stack>
    </Page>
  );
}
