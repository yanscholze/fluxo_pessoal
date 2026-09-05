import Link from "next/link";

import { ACTIVITY_COLOR, ACTIVITY_LABEL, type Activity } from "../../../../core/domain/work/activity.ts";
import { toHours, type Milli } from "../../../../core/domain/work/hours.ts";
import { PROJECT_STATUS_LABEL } from "../../../../core/domain/work/status.ts";
import { buildTimesheetReport } from "../../../../server/services/work.ts";
import { currentUser } from "../../../auth-context.ts";
import { DonutChart } from "../../../ui/charts.tsx";
import { DataTable, MetricStrip, Td, Tr } from "../../../ui/data-display.tsx";
import { dateShort, decimal, money, percent } from "../../../ui/format.ts";
import { Briefcase, Clock, Coins, Layers } from "../../../ui/icons.tsx";
import { Page, PageHeader, SectionTitle, Stack } from "../../../ui/page-frame.tsx";
import { Badge, Empty, Meter, Panel, PanelHeader } from "../../../ui/primitives.tsx";
import { WorkNav } from "../work-nav.tsx";

export const dynamic = "force-dynamic";

/**
 * Relatório de horas.
 *
 * A pergunta é uma só: **o projeto pagou o tempo que custou**. Ela não se
 * responde com o total de horas nem com o valor do contrato separadamente — só
 * com os dois juntos, e divididos.
 *
 * Por isso o valor/hora efetivo vem primeiro, e é receita ÷ horas trabalhadas,
 * dividindo pelo tempo **todo**, cobrável ou não. Dividir só pelas horas
 * cobráveis inflaria o número justamente nos projetos que deram mais
 * retrabalho, escondendo o prejuízo que se quer enxergar.
 *
 * Nada disso está guardado em lugar nenhum: cada número aqui é calculado das
 * sessões e das parcelas recebidas, agora. Congelar o preço em cada lançamento
 * faria o relatório depender de quando cada hora foi digitada, e não do que o
 * projeto rendeu — e receber uma parcela a mais não mudaria um número que
 * deveria mudar.
 */
export default async function RelatorioDeHoras({
  searchParams,
}: {
  searchParams: Promise<{ projeto?: string }>;
}) {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const { projeto: filtro } = await searchParams;
  const relatorio = await buildTimesheetReport(user.id, filtro);
  const { totals } = relatorio;

  const horas = toHours(totals.worked);
  const foco = filtro ? relatorio.projects.find((linha) => linha.projectId === filtro) : null;

  return (
    <Page>
      <PageHeader
        title="Horas"
        description="Quanto tempo cada projeto custou, em quê ele foi gasto, e quanto a hora rendeu de verdade."
      >
        <WorkNav />
      </PageHeader>

      <Stack gap="lg">
        {/* O filtro é por projeto e não por período: a pergunta do relatório de
            horas é sobre um trabalho inteiro, do começo ao fim, e recortá-lo
            por mês responderia outra coisa. */}
        {relatorio.projects.length > 1 ? (
          <nav aria-label="Projeto" className="flex flex-wrap gap-1.5">
            <FiltroDeProjeto href="/projetos/horas" ativo={!filtro} rotulo="Todos" />
            {relatorio.projects.map((linha) => (
              <FiltroDeProjeto
                key={linha.projectId}
                href={`/projetos/horas?projeto=${linha.projectId}`}
                ativo={filtro === linha.projectId}
                rotulo={linha.projectName}
              />
            ))}
          </nav>
        ) : null}

        <MetricStrip
          metrics={[
            {
              label: "Total de horas",
              value: `${decimal(horas, 1)} h`,
              icon: Clock,
              hint: `${totals.sessions} ${totals.sessions === 1 ? "sessão" : "sessões"} · ${decimal(toHours(totals.billableWorked), 1)} h cobráveis`,
            },
            {
              label: "Receita",
              value: money(totals.revenueCents),
              icon: Coins,
              tone: totals.revenueCents > 0 ? "positive" : "neutral",
              hint: "O que já entrou, não o contratado",
            },
            {
              label: "Valor/hora efetivo",
              value: totals.effectiveRateCents === null ? "—" : money(totals.effectiveRateCents),
              tone: totals.effectiveRateCents === null ? "neutral" : "accent",
              hint: "Receita ÷ horas trabalhadas",
            },
            {
              label: "Média por projeto",
              value: `${decimal(totals.averageHoursPerProject, 1)} h`,
              icon: Briefcase,
              hint: `${relatorio.projects.length} ${relatorio.projects.length === 1 ? "projeto" : "projetos"} com horas`,
            },
          ]}
        />

        {totals.sessions === 0 ? (
          <Panel>
            <Empty
              icon={Clock}
              title="Nenhuma hora registrada"
              hint="Registre o tempo dentro de cada projeto. Sem sessões não há como saber quanto a hora rendeu."
            />
          </Panel>
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <Panel>
                <PanelHeader title="Em que o tempo foi" hint="Percentual do total" icon={Layers} />
                <div className="mt-2 flex justify-center">
                  <DonutChart
                    slices={totals.byActivity.map((linha) => ({
                      id: linha.activity,
                      label: ACTIVITY_LABEL[linha.activity],
                      value: linha.worked,
                      color: ACTIVITY_COLOR[linha.activity],
                    }))}
                    format={(valor) => `${decimal(toHours(valor as Milli), 1)} h`}
                    centerLabel="no total"
                    centerValue={`${decimal(horas, 1)} h`}
                  />
                </div>

                <ul className="mt-5 space-y-3">
                  {totals.byActivity.map((linha) => (
                    <li key={linha.activity}>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: ACTIVITY_COLOR[linha.activity] }}
                            aria-hidden
                          />
                          <span className="truncate text-body text-ink">
                            {ACTIVITY_LABEL[linha.activity]}
                          </span>
                          <span className="shrink-0 text-caption text-ink-subtle">
                            {linha.sessions}×
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="tabular block text-body-sm font-medium text-ink">
                            {decimal(toHours(linha.worked), 1)} h
                          </span>
                          <span className="block text-caption text-ink-subtle">
                            {percent(linha.percent, 1)}
                          </span>
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <Meter
                          value={linha.worked}
                          total={Math.max(1, totals.worked)}
                          size="sm"
                          label={`${ACTIVITY_LABEL[linha.activity]}: ${percent(linha.percent, 1)}`}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel>
                <PanelHeader
                  title="Por projeto"
                  icon={Briefcase}
                  hint="Ordenados pelo que mais consumiu tempo"
                />
                <DataTable
                  caption="Horas e retorno por projeto"
                  columns={[
                    { key: "projeto", header: "Projeto", flexible: true },
                    { key: "horas", header: "Horas", align: "right", width: "5rem" },
                    { key: "receita", header: "Receita", align: "right", width: "7rem", hideBelow: "sm" },
                    { key: "hora", header: "Por hora", align: "right", width: "6.5rem" },
                  ]}
                >
                  {relatorio.projects.map((linha) => (
                    <Tr key={linha.projectId}>
                      <Td truncate>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/projetos/${linha.projectId}`}
                            className="truncate text-body text-ink hover:underline"
                          >
                            {linha.projectName}
                          </Link>
                          {linha.isOpen ? null : <Badge tone="neutral">encerrado</Badge>}
                        </span>
                        <span className="block truncate text-caption text-ink-subtle">
                          {linha.clientName ?? "sem cliente"} ·{" "}
                          {PROJECT_STATUS_LABEL[linha.status] ?? linha.status}
                          {linha.summary.reworkPercent > 0
                            ? ` · ${percent(linha.summary.reworkPercent, 0)} retrabalho`
                            : ""}
                        </span>
                      </Td>
                      <Td align="right" className="tabular whitespace-nowrap text-body-sm text-ink">
                        {decimal(toHours(linha.summary.worked), 1)}
                      </Td>
                      <Td align="right" hideBelow="sm" className="tabular text-body-sm text-ink-muted">
                        {money(linha.summary.revenue)}
                      </Td>
                      <Td align="right">
                        <span
                          className={`tabular text-body-sm font-medium ${
                            linha.summary.effectiveRate === null
                              ? "text-ink-subtle"
                              : linha.plannedRateCents > 0 &&
                                  linha.summary.effectiveRate < linha.plannedRateCents
                                ? "text-negative"
                                : "text-ink"
                          }`}
                        >
                          {linha.summary.effectiveRate === null
                            ? "—"
                            : money(linha.summary.effectiveRate)}
                        </span>
                        {linha.plannedRateCents > 0 ? (
                          <span className="block text-caption text-ink-subtle">
                            combinado {money(linha.plannedRateCents)}
                          </span>
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </DataTable>
              </Panel>
            </div>

            <section>
              <SectionTitle
                title={foco ? `Sessões · ${foco.projectName}` : "Todas as sessões"}
                hint={`${relatorio.sessions.length} ${relatorio.sessions.length === 1 ? "lançamento" : "lançamentos"}, do mais recente`}
              />
              <Panel>
                <DataTable
                  caption="Detalhamento das sessões de trabalho"
                  columns={[
                    { key: "data", header: "Data", width: "5.5rem" },
                    { key: "descricao", header: "O que foi feito", flexible: true },
                    { key: "categoria", header: "Categoria", hideBelow: "sm" },
                    { key: "projeto", header: "Projeto", hideBelow: "lg" },
                    { key: "duracao", header: "Horas", align: "right", width: "5rem" },
                  ]}
                >
                  {relatorio.sessions.map((sessao) => (
                    <Tr key={sessao.id}>
                      <Td className="tabular whitespace-nowrap text-caption text-ink-subtle">
                        {dateShort(sessao.workedOn)}
                      </Td>
                      <Td truncate>
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-body-sm text-ink">{sessao.description}</span>
                          {!sessao.billable ? <Badge tone="neutral">não cobrável</Badge> : null}
                        </span>
                        {sessao.taskTitle ? (
                          <span className="block truncate text-caption text-ink-subtle">
                            {sessao.taskTitle}
                          </span>
                        ) : null}
                      </Td>
                      <Td hideBelow="sm">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: ACTIVITY_COLOR[sessao.activity as Activity] }}
                            aria-hidden
                          />
                          <span className="truncate text-body-sm text-ink-muted">
                            {ACTIVITY_LABEL[sessao.activity as Activity]}
                          </span>
                        </span>
                      </Td>
                      <Td hideBelow="lg" className="truncate text-body-sm text-ink-muted">
                        {sessao.projectName}
                      </Td>
                      <Td align="right" className="tabular whitespace-nowrap text-body-sm text-ink">
                        {decimal(toHours(sessao.durationMilli as Milli), 2)}
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

function FiltroDeProjeto({
  href,
  ativo,
  rotulo,
}: {
  href: string;
  ativo: boolean;
  rotulo: string;
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={`inline-flex h-8 max-w-[14rem] shrink-0 items-center truncate rounded-md border px-3 text-body-sm font-medium transition-colors ${
        ativo
          ? "border-accent-edge bg-accent-wash text-accent"
          : "border-line-strong bg-surface text-ink-muted hover:bg-surface-inset hover:text-ink"
      }`}
    >
      {rotulo}
    </Link>
  );
}
