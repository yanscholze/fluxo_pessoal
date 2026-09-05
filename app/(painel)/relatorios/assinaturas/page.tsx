import { buildSubscriptionsReport } from "../../../../server/services/subscriptions.ts";
import { currentUser } from "../../../auth-context.ts";
import { DonutChart } from "../../../ui/charts.tsx";
import { Amount, DataTable, MetricStrip, Td, Tr } from "../../../ui/data-display.tsx";
import { competenceLong, money, percent } from "../../../ui/format.ts";
import { CreditCard, Layers, Repeat } from "../../../ui/icons.tsx";
import { Page, PageHeader, SectionTitle, Stack } from "../../../ui/page-frame.tsx";
import { Badge, Empty, Meter, Panel, PanelHeader } from "../../../ui/primitives.tsx";
import { ReportNav } from "../report-nav.tsx";

export const dynamic = "force-dynamic";

/**
 * Relatório de assinaturas.
 *
 * O custo anual anda ao lado do mensal, com o mesmo peso, em toda linha desta
 * tela. "R$ 89,90 por mês" soa desprezível; "R$ 1.078,80 por ano" é a mesma
 * informação e muda a decisão. Mostrar só o mensal é o que faz assinatura ser
 * o gasto mais fácil de perder de vista: cada uma é pequena, nenhuma exige uma
 * decisão nova, e o dano é a soma.
 */
export default async function RelatorioDeAssinaturas() {
  const user = await currentUser();
  if (!user) return null;

  const report = await buildSubscriptionsReport(user.id);
  const { totals } = report;

  return (
    <Page>
      <PageHeader
        eyebrow={competenceLong(report.competence)}
        title="Assinaturas"
        description="Quanto some da conta todo mês sem você decidir nada, e em quê."
      >
        <ReportNav />
      </PageHeader>

      <Stack gap="lg">
        <MetricStrip
          metrics={[
            {
              label: "Por mês",
              value: money(totals.monthlyCents),
              hint: `${totals.activeCount} assinatura${totals.activeCount === 1 ? "" : "s"} ativa${totals.activeCount === 1 ? "" : "s"}`,
              icon: Repeat,
            },
            {
              label: "Por ano",
              value: money(totals.yearlyCents),
              tone: "caution",
              hint: "O mesmo gasto, no prazo em que ele pesa",
            },
            {
              label: "Classificações",
              value: String(report.byLabel.length),
              hint: report.byLabel.length ? report.byLabel[0].label?.name ?? "Sem classificação" : "Nenhuma",
              icon: Layers,
            },
            {
              label: "Pausadas",
              value: String(totals.pausedCount),
              hint: totals.pausedCount ? "Não somam no total" : "Nenhuma",
            },
          ]}
        />

        {report.subscriptions.length === 0 ? (
          <Panel>
            <Empty
              icon={Repeat}
              title="Nenhuma assinatura cadastrada"
              hint="Cadastre na aba Assinaturas para acompanhar o custo mensal e anual."
            />
          </Panel>
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <Panel>
                <PanelHeader title="Por classificação" hint="Custo mensal" />
                <div className="mt-2 flex justify-center">
                  <DonutChart
                    slices={report.byLabel.map((linha, indice) => ({
                      id: linha.label?.id ?? `sem-${indice}`,
                      label: linha.label?.name ?? "Sem classificação",
                      value: linha.monthlyCents,
                      color: linha.label?.color,
                    }))}
                    format={money}
                    centerLabel="por mês"
                    centerValue={money(totals.monthlyCents)}
                  />
                </div>

                <ul className="mt-5 space-y-3">
                  {report.byLabel.map((linha, indice) => (
                    <li key={linha.label?.id ?? `sem-${indice}`}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: linha.label?.color ?? "var(--color-line-strong)" }}
                            aria-hidden
                          />
                          <span className="truncate text-body text-ink">
                            {linha.label?.name ?? "Sem classificação"}
                          </span>
                          <span className="shrink-0 text-caption text-ink-subtle">{linha.count}×</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="tabular block text-body-sm font-medium text-ink">
                            {money(linha.monthlyCents)}
                          </span>
                          <span className="block text-caption text-ink-subtle">
                            {money(linha.yearlyCents)}/ano
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <Meter
                          value={linha.monthlyCents}
                          total={Math.max(1, totals.monthlyCents)}
                          size="sm"
                          label={`${linha.label?.name ?? "Sem classificação"}: ${percent(linha.sharePercent)}`}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel>
                <PanelHeader title="Por onde é cobrada" icon={CreditCard} hint="Peso em cada fatura" />
                <ul className="mt-1 space-y-3">
                  {report.byCard.map((linha) => (
                    <li key={linha.cardId ?? "conta"}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-body text-ink">{linha.cardName}</span>
                        <span className="tabular shrink-0 text-body-sm text-ink">
                          {money(linha.monthlyCents)}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <Meter
                          value={linha.monthlyCents}
                          total={Math.max(1, totals.monthlyCents)}
                          size="sm"
                          tone="caution"
                          label={`${linha.cardName}: ${money(linha.monthlyCents)} por mês`}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            </div>

            <section>
              <SectionTitle title="Todas as assinaturas" hint="Ordenadas pelo que mais pesa" />
              <Panel>
                <DataTable
                  caption="Assinaturas cadastradas"
                  columns={[
                    { key: "nome", header: "Assinatura", flexible: true },
                    { key: "classificacao", header: "Classificação", hideBelow: "md" },
                    { key: "cobranca", header: "Cobrada em", hideBelow: "lg" },
                    { key: "mensal", header: "Por mês", align: "right", width: "7rem" },
                    { key: "anual", header: "Por ano", align: "right", width: "7rem" },
                  ]}
                >
                  {report.subscriptions.map((assinatura) => (
                    <Tr key={assinatura.id}>
                      <Td truncate>
                        <span className="flex items-center gap-2">
                          <span
                            className={`truncate text-body ${assinatura.isActive ? "text-ink" : "text-ink-muted"}`}
                          >
                            {assinatura.description}
                          </span>
                          {!assinatura.isActive ? <Badge tone="neutral">pausada</Badge> : null}
                          {assinatura.interval === "yearly" ? <Badge tone="info">anual</Badge> : null}
                        </span>
                      </Td>
                      <Td hideBelow="md">
                        {assinatura.label ? (
                          <span className="flex items-center gap-1.5">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: assinatura.label.color }}
                              aria-hidden
                            />
                            <span className="truncate text-body-sm text-ink-muted">
                              {assinatura.label.name}
                            </span>
                          </span>
                        ) : (
                          <span className="text-caption text-ink-subtle">sem classificação</span>
                        )}
                      </Td>
                      <Td hideBelow="lg" className="truncate text-body-sm text-ink-muted">
                        {assinatura.cardName ?? "Débito em conta"} · dia {assinatura.scheduleDay}
                      </Td>
                      <Td align="right">
                        <Amount cents={-assinatura.monthlyCents} />
                      </Td>
                      <Td align="right" className="tabular whitespace-nowrap text-body-sm text-ink-muted">
                        {money(assinatura.yearlyCents)}
                      </Td>
                    </Tr>
                  ))}
                </DataTable>
              </Panel>
            </section>
          </>
        )}
      </Stack>
    </Page>
  );
}
