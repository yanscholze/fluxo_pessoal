import Link from "next/link";
import { redirect } from "next/navigation";

import { type ReportPeriod, buildReport } from "../../../server/services/reports.ts";
import { currentUser } from "../../auth-context.ts";
import { ChartFrame, DonutChart, LineChart, VIZ, chartColor } from "../../ui/charts.tsx";
import { Breakdown, MetricStrip } from "../../ui/data-display.tsx";
import { competenceShort, money, percent } from "../../ui/format.ts";
import { ArrowDownRight, ArrowUpRight, Download, PiggyBank, Scale, Sparkles } from "../../ui/icons.tsx";
import { Page, PageHeader, Stack, Toolbar } from "../../ui/page-frame.tsx";
import { Empty, Meter, Panel, PanelHeader } from "../../ui/primitives.tsx";

export const dynamic = "force-dynamic";

const PERIODOS: readonly [ReportPeriod, string][] = [
  ["mes", "Mês"],
  ["3m", "3 meses"],
  ["6m", "6 meses"],
  ["12m", "1 ano"],
  ["todos", "Tudo"],
];

function periodoValido(valor: string | undefined): ReportPeriod {
  return PERIODOS.some(([chave]) => chave === valor) ? (valor as ReportPeriod) : "6m";
}

/**
 * Relatórios.
 *
 * A leitura em texto vem **antes** dos gráficos. Um gráfico responde "como
 * variou"; a frase responde "e daí" — e é a segunda pergunta que faz alguém
 * mudar de comportamento. Gráfico sem conclusão é decoração cara.
 *
 * O seletor de período é link e não botão: cada recorte é um endereço, então
 * dá para compartilhar e voltar pelo histórico do navegador.
 */
export default async function Relatorios({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const params = await searchParams;
  const periodo = periodoValido(params.periodo);
  const report = await buildReport(user.id, periodo);

  const maiorCategoria = report.expensesByCategory[0]?.amountCents ?? 1;
  const rotulos = report.monthly.map((ponto) => competenceShort(ponto.competence).replace(" de ", "/"));

  return (
    <Page>
      <PageHeader
        eyebrow={`${competenceShort(report.from)} a ${competenceShort(report.to)}`}
        title="Relatórios"
        description={`${report.indicators.transactionCount} lançamentos no período.`}
      >
        <Toolbar>
          {PERIODOS.map(([chave, rotulo]) => (
            <Link
              key={chave}
              href={`/relatorios?periodo=${chave}`}
              aria-current={periodo === chave ? "page" : undefined}
              className={`inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-body-sm font-medium transition-colors ${
                periodo === chave
                  ? "border-accent-edge bg-accent-wash text-accent"
                  : "border-line-strong bg-surface text-ink-muted hover:bg-surface-inset hover:text-ink"
              }`}
            >
              {rotulo}
            </Link>
          ))}
        </Toolbar>
      </PageHeader>

      <Stack gap="lg">
        <MetricStrip
          metrics={[
            {
              label: "Entradas",
              value: money(report.indicators.incomeCents),
              tone: "positive",
              icon: ArrowUpRight,
            },
            {
              label: "Saídas",
              value: money(report.indicators.expenseCents),
              icon: ArrowDownRight,
              hint: `${money(report.indicators.averageMonthlyExpenseCents)} por mês em média`,
            },
            {
              label: "Resultado",
              value: money(report.indicators.netCents, { signed: true }),
              tone: report.indicators.netCents < 0 ? "negative" : "positive",
              icon: Scale,
            },
            {
              label: "Taxa de poupança",
              value: percent(report.indicators.savingsRatePercent),
              tone:
                report.indicators.savingsRatePercent < 0
                  ? "negative"
                  : report.indicators.savingsRatePercent >= 20
                    ? "positive"
                    : "caution",
              icon: PiggyBank,
              hint: "Do que entrou, quanto sobrou",
            },
          ]}
        />

        {report.insights.length ? (
          <Panel>
            <PanelHeader title="O que os números dizem" icon={Sparkles} />
            <ul className="space-y-2">
              {report.insights.map((frase) => (
                <li key={frase} className="flex gap-2.5 text-body text-ink">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-accent" aria-hidden />
                  {frase}
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel>
          {report.monthly.length ? (
            <ChartFrame
              title="Entradas, saídas e saldo"
              hint="Mês a mês, só o que passou por conta"
              legend={[
                { label: "Entradas", color: chartColor("positive") },
                { label: "Saídas", color: chartColor("negative") },
                { label: "Saldo acumulado", color: chartColor("accent") },
              ]}
            >
              <LineChart
                labels={rotulos}
                height={220}
                zeroLine
                format={(valor) => money(valor)}
                series={[
                  {
                    id: "entradas",
                    label: "Entradas",
                    color: chartColor("positive"),
                    values: report.monthly.map((ponto) => ponto.incomeCents),
                  },
                  {
                    id: "saidas",
                    label: "Saídas",
                    color: chartColor("negative"),
                    values: report.monthly.map((ponto) => ponto.expenseCents),
                  },
                  {
                    id: "saldo",
                    label: "Saldo acumulado",
                    color: chartColor("accent"),
                    values: report.monthly.map((ponto) => ponto.balanceCents),
                    fill: true,
                  },
                ]}
              />
            </ChartFrame>
          ) : (
            <Empty title="Nenhum movimento no período" hint="Escolha um recorte maior ou registre lançamentos." />
          )}
        </Panel>

        <div className="grid gap-5 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <PanelHeader
              title="Saídas por categoria"
              action={
                report.expensesByCategory.length ? (
                  <Link
                    href={`/api/v1/reports/export?periodo=${periodo}&fluxo=saidas`}
                    prefetch={false}
                    className="inline-flex items-center gap-1.5 text-body-sm font-medium text-accent hover:underline"
                  >
                    <Download size={14} strokeWidth={1.5} aria-hidden />
                    Exportar CSV
                  </Link>
                ) : undefined
              }
            />

            {report.expensesByCategory.length ? (
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                <DonutChart
                  slices={report.expensesByCategory.slice(0, 8).map((item, i) => ({
                    label: item.name,
                    value: item.amountCents,
                    color: item.color ?? VIZ[i % VIZ.length],
                  }))}
                  size={156}
                  thickness={17}
                  centerValue={money(report.indicators.expenseCents)}
                  centerLabel="no período"
                  format={(valor) => money(valor)}
                />

                <ul className="min-w-0 flex-1 space-y-3">
                  {report.expensesByCategory.slice(0, 8).map((item, i) => (
                    <li key={item.categoryId ?? "sem"}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color ?? VIZ[i % VIZ.length] }}
                            aria-hidden
                          />
                          <span className="truncate text-body-sm text-ink">{item.name}</span>
                          <span className="tabular shrink-0 text-caption text-ink-subtle">
                            {item.transactionCount}×
                          </span>
                        </span>
                        <span className="tabular shrink-0 text-body-sm text-ink">
                          {money(item.amountCents)}
                          <span className="ml-1.5 text-caption text-ink-subtle">{percent(item.percent)}</span>
                        </span>
                      </div>
                      <Meter value={item.amountCents} total={maiorCategoria} tone="accent" size="sm" label={item.name} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <Empty title="Nenhuma saída no período" compact />
            )}
          </Panel>

          <div className="space-y-5">
            <Panel>
              <PanelHeader title="Patrimônio hoje" icon={PiggyBank} />
              <Breakdown
                parts={[
                  { label: "Investimentos", cents: report.indicators.investmentsCents, sign: "+" },
                  { label: "Dívida de cartão", cents: report.indicators.cardDebtCents, sign: "−" },
                ]}
                result={{
                  label: "Patrimônio líquido",
                  cents: report.indicators.netWorthCents,
                  tone: report.indicators.netWorthCents < 0 ? "negative" : "neutral",
                }}
              />
            </Panel>

            {report.incomeByCategory.length ? (
              <Panel>
                <PanelHeader title="Entradas por origem" icon={ArrowUpRight} />
                <ul className="space-y-2">
                  {report.incomeByCategory.slice(0, 6).map((item) => (
                    <li key={item.categoryId ?? "sem"} className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-body-sm text-ink-muted">{item.name}</span>
                      <span className="tabular shrink-0 text-body-sm font-medium text-positive">
                        {money(item.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            ) : null}
          </div>
        </div>
      </Stack>
    </Page>
  );
}
