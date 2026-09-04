import { buildInstallmentsView } from "../../../server/services/installments.ts";
import { currentUser } from "../../auth-context.ts";
import { BarChart, ChartFrame } from "../../ui/charts.tsx";
import { MetricStrip } from "../../ui/data-display.tsx";
import { competenceShort, money, percent } from "../../ui/format.ts";
import { CircleCheck, Percent, Repeat, Wallet } from "../../ui/icons.tsx";
import { Page, PageHeader, SectionTitle, Stack } from "../../ui/page-frame.tsx";
import { Empty, Panel } from "../../ui/primitives.tsx";
import { PlanCard } from "./plan-card.tsx";

export const dynamic = "force-dynamic";

/**
 * Parcelamentos.
 *
 * A leitura que importa não é "quanto devo" — é **quando meu orçamento volta a
 * ficar livre**. Por isso o gráfico de comprometimento vem antes da lista: ele
 * mostra a obrigação caindo mês a mês, e é o que permite decidir se cabe mais
 * uma parcela.
 */
export default async function Parcelamentos() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const view = await buildInstallmentsView(user.id);
  const temPlanos = view.active.length > 0 || view.settled.length > 0;

  const proximoMes = view.commitment[0];
  const ultimoMes = view.commitment.at(-1);

  return (
    <Page>
      <PageHeader
        title="Parcelamentos"
        description="Quanto de cada compra ainda falta, e o que já está comprometido mês a mês."
      />

      {!temPlanos ? (
        <Panel>
          <Empty
            icon={Repeat}
            title="Nenhuma compra parcelada"
            hint="Ao registrar uma despesa no cartão, informe o número de parcelas para acompanhar aqui."
          />
        </Panel>
      ) : (
        <Stack gap="lg">
          <MetricStrip
            metrics={[
              {
                label: "Em aberto",
                value: money(view.totals.openCents),
                tone: "caution",
                icon: Wallet,
                hint: `de ${money(view.totals.totalCents)} em ${view.active.length + view.settled.length} compras`,
              },
              {
                label: "Já pago",
                value: money(view.totals.paidCents),
                tone: "positive",
                icon: CircleCheck,
                hint: `${percent(view.totals.percentPaid)} do total quitado`,
              },
              {
                label: "Próxima parcela",
                value: proximoMes ? money(proximoMes.amountCents) : "—",
                icon: Percent,
                hint: proximoMes
                  ? `comprometido em ${competenceShort(proximoMes.competence)}`
                  : "sem parcela nos próximos meses",
              },
              {
                label: "Em andamento",
                value: String(view.active.length),
                icon: Repeat,
                hint: `${view.settled.length} já quitad${view.settled.length === 1 ? "o" : "os"}`,
              },
            ]}
          />

          {view.commitment.length ? (
            <Panel>
              <ChartFrame
                title="Comprometimento futuro"
                hint="Quanto de parcela já está reservado em cada mês"
                readout={
                  ultimoMes ? (
                    <p className="text-body-sm text-ink-muted">
                      Em {competenceShort(ultimoMes.competence)} a obrigação mensal cai para{" "}
                      <span className="tabular font-semibold text-ink">{money(ultimoMes.amountCents)}</span>
                    </p>
                  ) : null
                }
              >
                <BarChart
                  height={180}
                  format={(valor) => money(valor)}
                  bars={view.commitment.map((item) => ({
                    label: competenceShort(item.competence).replace(" de ", "/"),
                    value: item.amountCents,
                    tone: "accent",
                  }))}
                />
              </ChartFrame>
            </Panel>
          ) : null}

          {view.active.length ? (
            <section>
              <SectionTitle
                title="Em andamento"
                hint={`${view.active.length} compra${view.active.length > 1 ? "s" : ""} ainda pagando`}
              />
              <div className="space-y-4">
                {view.active.map((plan) => (
                  <PlanCard key={plan.planId} plan={plan} />
                ))}
              </div>
            </section>
          ) : null}

          {view.settled.length ? (
            <section>
              <SectionTitle title="Quitados" hint="Compras que já terminaram de ser pagas" />
              <div className="space-y-4">
                {view.settled.map((plan) => (
                  <PlanCard key={plan.planId} plan={plan} />
                ))}
              </div>
            </section>
          ) : null}
        </Stack>
      )}
    </Page>
  );
}
