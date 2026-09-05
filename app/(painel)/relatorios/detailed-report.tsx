/**
 * Corpo de um relatório detalhado.
 *
 * Despesa e renda respondem a mesma pergunta em direções opostas — quanto, em
 * quê, por onde, e quais foram os maiores. Uma tela para cada, com a mesma
 * estrutura, é o que permite comparar as duas sem reaprender a leitura.
 *
 * A ordem é deliberada: o total e a média primeiro, porque é o que se leva; a
 * série depois, porque mostra se o total é típico ou exceção; a divisão por
 * categoria em seguida; e os maiores lançamentos por último — é onde a
 * explicação costuma estar, mas só depois de saber que há o que explicar.
 */

import type { DetailedReport } from "../../../server/services/reports.ts";
import { BarChart } from "../../ui/charts.tsx";
import { Amount, DataTable, MetricStrip, Td, Tr } from "../../ui/data-display.tsx";
import { competenceShort, dateShort, money, percent } from "../../ui/format.ts";
import { SectionTitle, Stack } from "../../ui/page-frame.tsx";
import { Empty, Meter, Panel, PanelHeader } from "../../ui/primitives.tsx";

export function DetailedReportBody({
  report,
  kind,
}: {
  report: DetailedReport;
  kind: "expense" | "income";
}) {
  const entrada = kind === "income";
  const vazio = report.transactionCount === 0;

  return (
    <Stack gap="lg">
      <MetricStrip
        metrics={[
          {
            label: entrada ? "Total recebido" : "Total gasto",
            value: money(report.totalCents),
            tone: entrada ? "positive" : "neutral",
            hint: `${report.transactionCount} lançamento${report.transactionCount === 1 ? "" : "s"}`,
          },
          {
            label: "Média por mês",
            value: money(report.monthlyAverageCents),
            hint: `${report.months} ${report.months === 1 ? "mês" : "meses"} no recorte`,
          },
          {
            label: entrada ? "Maior entrada" : "Maior saída",
            value: report.largest.length ? money(report.largest[0].amountCents) : "—",
            hint: report.largest.length ? report.largest[0].description : "Nada no período",
          },
          {
            label: entrada ? "Origens" : "Categorias",
            value: String(report.byCategory.length),
            hint: report.byCategory.length ? report.byCategory[0].name : "Nenhuma",
          },
        ]}
      />

      {vazio ? (
        <Panel>
          <Empty
            title={entrada ? "Nenhuma entrada no período" : "Nenhuma saída no período"}
            hint="Escolha um recorte maior ou registre lançamentos."
          />
        </Panel>
      ) : (
        <>
          <section>
            <SectionTitle
              title="Mês a mês"
              hint="A média só quer dizer alguma coisa quando os meses se parecem"
            />
            <Panel>
              <BarChart
                bars={report.monthly.map((ponto) => ({
                  label: competenceShort(ponto.competence),
                  value: entrada ? ponto.incomeCents : ponto.expenseCents,
                  tone: entrada ? "positive" : "negative",
                }))}
                format={money}
              />
            </Panel>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel>
              <PanelHeader
                title={entrada ? "Por origem da renda" : "Por categoria"}
                hint={`${report.byCategory.length} no período`}
              />
              <ul className="mt-1 space-y-3">
                {report.byCategory.slice(0, 10).map((grupo) => (
                  <li key={grupo.key}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: grupo.color ?? "var(--color-line-strong)" }}
                          aria-hidden
                        />
                        <span className="truncate text-body text-ink">{grupo.name}</span>
                        <span className="shrink-0 text-caption text-ink-subtle">
                          {grupo.count}×
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <Amount cents={entrada ? grupo.amountCents : -grupo.amountCents} />
                        <span className="block text-caption text-ink-subtle">
                          {money(grupo.monthlyAverageCents)}/mês
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Meter
                        value={grupo.amountCents}
                        total={Math.max(1, report.totalCents)}
                        size="sm"
                        tone={entrada ? "positive" : "accent"}
                        label={`${grupo.name}: ${percent(grupo.percent)}`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel>
              <PanelHeader
                title="Por onde passou"
                hint="Conta ou cartão"
              />
              <ul className="mt-1 space-y-3">
                {report.byOrigin.slice(0, 10).map((grupo) => (
                  <li key={grupo.key}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-body text-ink">{grupo.name}</span>
                      <span className="tabular shrink-0 text-body-sm text-ink">
                        {money(grupo.amountCents)}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <Meter
                        value={grupo.amountCents}
                        total={Math.max(1, report.totalCents)}
                        size="sm"
                        label={`${grupo.name}: ${percent(grupo.percent)}`}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <section>
            <SectionTitle
              title={entrada ? "Maiores entradas" : "Maiores saídas"}
              hint="É onde a explicação costuma estar"
            />
            <Panel>
              <DataTable
                caption={entrada ? "Maiores entradas do período" : "Maiores saídas do período"}
                columns={[
                  { key: "descricao", header: "Lançamento", flexible: true },
                  { key: "categoria", header: "Categoria", hideBelow: "md" },
                  { key: "origem", header: "Onde", hideBelow: "lg" },
                  { key: "data", header: "Data", align: "right", width: "5.5rem" },
                  { key: "valor", header: "Valor", align: "right", width: "8rem" },
                ]}
              >
                {report.largest.map((linha) => (
                  <Tr key={linha.id}>
                    <Td truncate className="truncate text-body text-ink">{linha.description}</Td>
                    <Td hideBelow="md">
                      {linha.categoryName ? (
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: linha.categoryColor ?? "var(--color-line-strong)" }}
                            aria-hidden
                          />
                          <span className="truncate text-body-sm text-ink-muted">{linha.categoryName}</span>
                        </span>
                      ) : (
                        <span className="text-caption text-ink-subtle">sem categoria</span>
                      )}
                    </Td>
                    <Td hideBelow="lg" className="truncate text-body-sm text-ink-muted">
                      {linha.originName}
                    </Td>
                    <Td align="right" className="tabular whitespace-nowrap text-caption text-ink-subtle">
                      {dateShort(linha.occurredOn)}
                    </Td>
                    <Td align="right">
                      <Amount cents={entrada ? linha.amountCents : -linha.amountCents} />
                    </Td>
                  </Tr>
                ))}
              </DataTable>
            </Panel>
          </section>
        </>
      )}
    </Stack>
  );
}
