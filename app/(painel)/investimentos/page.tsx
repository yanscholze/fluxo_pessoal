import { latest } from "../../../core/time/local-date.ts";
import {
  ASSET_CLASS_LABEL,
  LIQUIDITY_LABEL,
  type Liquidity,
  buildInvestmentsView,
} from "../../../server/services/investments.ts";
import { currentUser } from "../../auth-context.ts";
import { ChartFrame, DonutChart, VIZ } from "../../ui/charts.tsx";
import { Amount, Breakdown, DataTable, Delta, ListRow, Td, Timeline, Tr } from "../../ui/data-display.tsx";
import { date, money, moneyCompact, percent, relativeDay } from "../../ui/format.ts";
import { Calendar, PieChart, PiggyBank } from "../../ui/icons.tsx";
import { Page, PageHeader, SectionTitle, Stack } from "../../ui/page-frame.tsx";
import { Badge, Caption, Empty, Figure, Label, Meter, Panel, PanelHeader } from "../../ui/primitives.tsx";
import { InvestmentForm } from "./investment-form.tsx";

export const dynamic = "force-dynamic";

/** Ordem fixa: do dinheiro que sai hoje ao que só sai no vencimento. */
const ORDEM_LIQUIDEZ: readonly Liquidity[] = ["daily", "scheduled", "maturity"];

/**
 * Investimentos.
 *
 * A tela responde três perguntas, nessa ordem de importância: quanto vale a
 * carteira hoje, quanto disso é rendimento, e onde o dinheiro está. Por isso o
 * valor de mercado ganha superfície própria com a conta que o produziu ao
 * lado — patrimônio informado sem a decomposição obriga o usuário a confiar
 * cegamente num número que ele mesmo alimentou.
 *
 * A distribuição por classe fica na mesma faixa do total, e não num painel
 * abaixo: "quanto tenho" e "em quê" são a mesma leitura.
 */
export default async function Investimentos() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const view = await buildInvestmentsView(user.id);
  const { totals } = view;
  const rendeu = totals.yieldCents >= 0;

  // A carteira só vale a data em que foi avaliada. Sem esse carimbo, um valor
  // digitado há seis meses se passa por cotação de hoje.
  const avaliadaEm = latest(view.investments.flatMap((ativo) => (ativo.valuedOn ? [ativo.valuedOn] : [])));

  // Agregações de apresentação: nenhum número novo, só recortes do que o
  // serviço já entregou por ativo.
  const porLiquidez = ORDEM_LIQUIDEZ.map((liquidez) => ({
    liquidez,
    valueCents: view.investments
      .filter((ativo) => ativo.liquidity === liquidez)
      .reduce((soma, ativo) => soma + ativo.currentValueCents, 0),
  })).filter((item) => item.valueCents > 0);

  const resgatavelHoje = porLiquidez.find((item) => item.liquidez === "daily")?.valueCents ?? 0;

  const vencimentos = view.investments
    .filter((ativo) => ativo.maturityDate && ativo.maturityDate >= view.today)
    .sort((esquerda, direita) => (esquerda.maturityDate ?? "").localeCompare(direita.maturityDate ?? ""))
    .slice(0, 5);

  const fatias = view.byClass.map((item, indice) => ({
    ...item,
    color: VIZ[indice % VIZ.length],
  }));

  if (!view.investments.length) {
    return (
      <Page>
        <PageHeader
          eyebrow="Carteira"
          title="Investimentos"
          description="Patrimônio investido, rentabilidade e distribuição. Investimento é patrimônio, não dinheiro do mês: ele fica fora do livre para gastar."
        />
        <Panel padding="lg">
          <Empty
            icon={PiggyBank}
            title="Nenhum ativo cadastrado"
            hint="Cadastre o que você já tem aplicado — com o valor aportado e o valor de mercado de hoje — para acompanhar rentabilidade e distribuição."
            action={<InvestmentForm accounts={view.accounts} label="Cadastrar primeiro ativo" />}
          />
        </Panel>
      </Page>
    );
  }

  return (
    <Page width="wide">
      <PageHeader
        eyebrow={avaliadaEm ? `Valores de ${date(avaliadaEm)}` : "Carteira"}
        title="Investimentos"
        description="Investimento é patrimônio, não dinheiro do mês. O rendimento é a diferença entre o valor de mercado que você informou e o que foi aportado."
        actions={<InvestmentForm accounts={view.accounts} />}
      />

      <Stack gap="lg">
        {/* A faixa que responde a tela. Superfície própria e número em display:
            é o único da página nesse peso. */}
        <Panel padding="lg" className="reveal relative overflow-hidden">
          <span
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-32 size-72 rounded-full bg-accent/10 blur-3xl"
          />

          <div className="relative grid gap-8 lg:grid-cols-2 lg:gap-10">
            <div className="min-w-0">
              <Label>Valor de mercado da carteira</Label>
              <Figure value={money(totals.currentValueCents)} size="xl" className="mt-2" />

              <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <Amount
                  cents={totals.yieldCents}
                  signed
                  tone={totals.yieldCents === 0 ? "neutral" : rendeu ? "positive" : "negative"}
                  size="body"
                />
                <Delta percent={totals.yieldPercent} suffix="sobre o aportado" />
              </p>

              <div className="mt-6 max-w-sm rounded-md border border-line bg-surface-sunken p-4">
                <Label className="mb-3">Como se chega a esse valor</Label>
                <Breakdown
                  parts={[
                    { label: "Total aportado", cents: totals.principalCents, sign: "+" },
                    {
                      label: rendeu ? "Rendimento acumulado" : "Perda acumulada",
                      cents: Math.abs(totals.yieldCents),
                      sign: rendeu ? "+" : "−",
                    },
                  ]}
                  result={{ label: "Valor de mercado", cents: totals.currentValueCents }}
                />
              </div>

              <Caption className="mt-3">
                {view.investments.length} ativo{view.investments.length === 1 ? "" : "s"} em{" "}
                {view.byClass.length} classe{view.byClass.length === 1 ? "" : "s"}
                {avaliadaEm ? ` · última reavaliação ${relativeDay(avaliadaEm, view.today)}` : ""}
              </Caption>
            </div>

            <ChartFrame
              title="Distribuição por classe"
              hint="Concentração é risco: uma classe sozinha carregando a carteira aparece aqui antes de aparecer no bolso."
              className="min-w-0"
            >
              <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                <DonutChart
                  slices={fatias.map((item) => ({
                    label: item.label,
                    value: item.valueCents,
                    color: item.color,
                  }))}
                  size={168}
                  thickness={18}
                  centerValue={moneyCompact(totals.currentValueCents)}
                  centerLabel="na carteira"
                  format={(valor) => money(valor)}
                />

                <ul className="w-full min-w-0 flex-1">
                  {fatias.map((item) => (
                    <ListRow
                      key={item.assetClass}
                      accentColor={item.color}
                      title={item.label}
                      value={money(item.valueCents)}
                      meta={percent(item.percent)}
                    />
                  ))}
                </ul>
              </div>
            </ChartFrame>
          </div>
        </Panel>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Tabela e não lista: aqui o usuário compara aportado contra valor
              atual linha a linha, e só coluna alinhada permite isso. */}
          <section className="min-w-0 lg:col-span-2">
            <SectionTitle
              title="Ativos"
              hint="Do maior para o menor valor de mercado"
              action={<Caption>{view.investments.length} na carteira</Caption>}
            />

            <DataTable
              caption="Ativos da carteira com valor aportado, valor atual, rentabilidade e participação"
              columns={[
                { key: "ativo", header: "Ativo" },
                { key: "classe", header: "Classe", hideBelow: "md" },
                { key: "aportado", header: "Aportado", align: "right", hideBelow: "sm" },
                { key: "atual", header: "Valor atual", align: "right" },
                { key: "rendimento", header: "Rentabilidade", align: "right" },
                { key: "fatia", header: "Carteira", align: "right", width: "8.5rem", hideBelow: "lg" },
              ]}
            >
              {view.investments.map((ativo) => {
                const positivo = ativo.yieldCents >= 0;
                const contexto = [
                  ativo.institution || null,
                  `liquidez ${LIQUIDITY_LABEL[ativo.liquidity].toLowerCase()}`,
                  ativo.maturityDate ? `vence ${date(ativo.maturityDate)}` : null,
                  ativo.accountName ? `custódia ${ativo.accountName}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ");

                return (
                  <Tr key={ativo.id}>
                    <Td>
                      <span className="block truncate text-body text-ink">{ativo.name}</span>
                      <span className="mt-0.5 block truncate text-caption text-ink-subtle">{contexto}</span>
                    </Td>
                    <Td hideBelow="md">
                      <Badge>{ASSET_CLASS_LABEL[ativo.assetClass]}</Badge>
                    </Td>
                    <Td align="right" hideBelow="sm" className="whitespace-nowrap">
                      <Amount cents={ativo.principalCents} size="body-sm" className="text-ink-muted" />
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      <Amount cents={ativo.currentValueCents} size="body" />
                    </Td>
                    <Td align="right" className="whitespace-nowrap">
                      <Amount
                        cents={ativo.yieldCents}
                        signed
                        tone={ativo.yieldCents === 0 ? "neutral" : positivo ? "positive" : "negative"}
                        size="body-sm"
                      />
                      <span className="tabular mt-0.5 block text-caption text-ink-subtle">
                        {percent(ativo.yieldPercent, 1)}
                      </span>
                    </Td>
                    <Td align="right" hideBelow="lg">
                      <span className="tabular block text-body-sm text-ink">{percent(ativo.sharePercent)}</span>
                      <Meter
                        value={ativo.currentValueCents}
                        total={Math.max(1, totals.currentValueCents)}
                        size="sm"
                        label={`Participação de ${ativo.name} na carteira`}
                        className="mt-1.5"
                      />
                    </Td>
                  </Tr>
                );
              })}
            </DataTable>
          </section>

          <div className="min-w-0 space-y-5">
            <Panel>
              <PanelHeader
                title="Liquidez"
                icon={PieChart}
                hint="Quanto da carteira vira dinheiro disponível, e quando"
              />

              <Label>Resgatável hoje</Label>
              <Figure value={money(resgatavelHoje)} size="sm" className="mt-1" />
              <Caption className="mt-1">
                {percent(totals.currentValueCents > 0 ? (resgatavelHoje / totals.currentValueCents) * 100 : 0)} do
                valor de mercado
              </Caption>

              <ul className="mt-5 space-y-3">
                {porLiquidez.map((item) => (
                  <li key={item.liquidez}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className="text-body-sm text-ink-muted">{LIQUIDITY_LABEL[item.liquidez]}</span>
                      <span className="tabular text-body-sm text-ink">{money(item.valueCents)}</span>
                    </div>
                    <Meter
                      value={item.valueCents}
                      total={Math.max(1, totals.currentValueCents)}
                      size="sm"
                      label={`Parcela da carteira com liquidez ${LIQUIDITY_LABEL[item.liquidez].toLowerCase()}`}
                    />
                  </li>
                ))}
              </ul>
            </Panel>

            {vencimentos.length ? (
              <Panel>
                <PanelHeader
                  title="Próximos vencimentos"
                  icon={Calendar}
                  hint="Dinheiro que volta para a conta na data"
                />
                <Timeline
                  items={vencimentos.map((ativo) => ({
                    id: ativo.id,
                    when: ativo.maturityDate ? date(ativo.maturityDate) : "",
                    title: ativo.name,
                    detail: ativo.maturityDate ? relativeDay(ativo.maturityDate, view.today) : undefined,
                    value: money(ativo.currentValueCents),
                    icon: Calendar,
                  }))}
                />
              </Panel>
            ) : null}
          </div>
        </div>
      </Stack>
    </Page>
  );
}
