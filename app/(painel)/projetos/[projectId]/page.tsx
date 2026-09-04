import { notFound } from "next/navigation";

import { type Milli, toHours } from "../../../../core/domain/work/hours.ts";
import { buildProjectDetail } from "../../../../server/services/work.ts";
import { currentUser } from "../../../auth-context.ts";
import { BackButton } from "../../../ui/back-button.tsx";
import { KeyValue, ListRow, MetricStrip, Timeline } from "../../../ui/data-display.tsx";
import { type LocalDate } from "../../../../core/time/local-date.ts";
import { dateShort, decimal, money } from "../../../ui/format.ts";
import { Clock, ExternalLink, Github, Wallet } from "../../../ui/icons.tsx";
import { Page, PageHeader, SectionTitle, Stack } from "../../../ui/page-frame.tsx";
import { Badge, Empty, Meter, Notice, Panel, PanelHeader } from "../../../ui/primitives.tsx";
import { LogTime } from "./log-time.tsx";
import { PaymentActions } from "./payment-actions.tsx";
import { ProposalsPanel } from "./proposals-panel.tsx";
import { TasksPanel } from "./tasks-panel.tsx";

export const dynamic = "force-dynamic";

/**
 * Um projeto.
 *
 * Responde em ordem: quanto falta receber, quanto tempo já custou, o que ainda
 * precisa ser feito, e o histórico. O financeiro vem primeiro porque é o que
 * decide se vale continuar; a lista de tarefas vem depois porque é o que se
 * consulta durante o trabalho, não antes de decidir sobre ele.
 */
export default async function Projeto({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const { projectId } = await params;

  const detalhe = await buildProjectDetail(user.id, projectId).catch(() => null);
  if (!detalhe) notFound();

  const { project, health, tasks, entries, payments, events } = detalhe;
  const abertas = tasks.filter((tarefa) => tarefa.status !== "done");
  const naoAgendado = health.finance.unscheduled;

  return (
    <Page>
      <PageHeader
        back={<BackButton fallback="/projetos" label="Projetos" />}
        eyebrow={detalhe.clientName ?? "Projeto próprio"}
        title={project.name}
        description={project.description ?? undefined}
        actions={<LogTime projectId={project.id} tasks={abertas.map((t) => ({ id: t.id, title: t.title }))} />}
      />

      <Stack gap="lg">
        <MetricStrip
          metrics={[
            {
              label: "A receber",
              value: money(health.finance.pending + health.finance.overdue),
              tone: health.finance.overdue > 0 ? "negative" : "neutral",
              hint:
                health.finance.overdue > 0
                  ? `${money(health.finance.overdue)} vencido`
                  : health.finance.nextDueOn
                    ? `Próxima em ${dateShort(health.finance.nextDueOn)}`
                    : "Nada agendado",
              icon: Wallet,
            },
            {
              label: "Recebido",
              value: money(health.finance.received),
              hint: `${decimal(health.finance.percentReceived, 0)}% do contrato`,
              tone: "positive",
            },
            {
              label: "Horas",
              value: `${decimal(toHours(health.effort.worked), 1)} h`,
              tone: health.effort.overrun ? "negative" : "neutral",
              hint:
                health.effort.estimated > 0
                  ? `de ${decimal(toHours(health.effort.estimated), 1)} h estimadas`
                  : "Sem estimativa",
              icon: Clock,
            },
            {
              label: "Valor/hora efetivo",
              value: health.effort.effectiveRate !== null ? money(health.effort.effectiveRate) : "—",
              tone: health.meetsRate === false ? "negative" : health.meetsRate ? "positive" : "neutral",
              hint:
                health.effort.plannedRate > 0
                  ? `combinado ${money(health.effort.plannedRate)}`
                  : "Sem valor/hora combinado",
            },
          ]}
        />

        {naoAgendado > 0 ? (
          <Notice tone="caution">
            <strong className="tabular">{money(naoAgendado)}</strong> do contrato não tem parcela
            agendada — é dinheiro combinado que ninguém vai cobrar sozinho.
          </Notice>
        ) : null}

        {health.deadline.status === "atrasado" ? (
          <Notice tone="negative">
            O prazo venceu há {Math.abs(health.deadline.daysLeft ?? 0)} dia
            {Math.abs(health.deadline.daysLeft ?? 0) === 1 ? "" : "s"}.
          </Notice>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <Panel>
            <PanelHeader
              title="Cobrança"
              hint={`${payments.length} parcela${payments.length === 1 ? "" : "s"}`}
            />
            {payments.length ? (
              <div className="mt-1">
                {payments.map((parcela) => {
                  const vencida = !parcela.receivedOn && parcela.dueOn < detalhe.today;
                  return (
                    <ListRow
                      key={parcela.id}
                      title={parcela.description}
                      subtitle={
                        parcela.receivedOn
                          ? `Recebido em ${dateShort(parcela.receivedOn as LocalDate)}`
                          : `Vence ${dateShort(parcela.dueOn as LocalDate)}`
                      }
                      value={money(parcela.amountCents)}
                      valueTone={parcela.receivedOn ? "positive" : vencida ? "negative" : "neutral"}
                      badge={
                        parcela.receivedOn ? (
                          <Badge tone="positive">recebido</Badge>
                        ) : vencida ? (
                          <Badge tone="negative">vencido</Badge>
                        ) : null
                      }
                      meta={
                        parcela.receivedOn ? null : (
                          <PaymentActions paymentId={parcela.id} description={parcela.description} />
                        )
                      }
                    />
                  );
                })}
              </div>
            ) : (
              <Empty
                icon={Wallet}
                title="Nenhuma parcela agendada"
                hint="Agende as parcelas para acompanhar o que falta receber."
              />
            )}

            <div className="mt-4 border-t border-line pt-4">
              <KeyValue
                columns={2}
                entries={[
                  { label: "Contratado", value: money(health.finance.contracted) },
                  { label: "Recebido", value: money(health.finance.received) },
                  { label: "A vencer", value: money(health.finance.pending) },
                  { label: "Vencido", value: money(health.finance.overdue) },
                ]}
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Esforço" hint="Comparado ao estimado" />
            {health.effort.estimated > 0 ? (
              <div className="mt-1">
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-caption text-ink-subtle">
                  <span>{decimal(health.effort.percentUsed, 0)}% do estimado</span>
                  <span className="tabular">
                    {health.effort.remaining >= 0
                      ? `${decimal(toHours(health.effort.remaining as Milli), 1)} h restantes`
                      : `${decimal(Math.abs(toHours(health.effort.remaining as Milli)), 1)} h além`}
                  </span>
                </div>
                <Meter
                  value={health.effort.worked}
                  total={Math.max(1, health.effort.estimated)}
                  tone={health.effort.overrun ? "negative" : "accent"}
                  label="Horas trabalhadas sobre o estimado"
                />
              </div>
            ) : (
              <p className="text-body-sm text-ink-muted">
                Sem estimativa, não há com o que comparar as horas.
              </p>
            )}

            <div className="mt-4 border-t border-line pt-4">
              <KeyValue
                columns={1}
                entries={[
                  { label: "Trabalhado", value: `${decimal(toHours(health.effort.worked), 1)} h` },
                  { label: "Cobrável", value: `${decimal(toHours(health.effort.billableWorked), 1)} h` },
                  { label: "Vale", value: money(health.effort.billableAmount) },
                ]}
              />
            </div>

            {(project.repositoryUrl || project.productionUrl) && (
              <div className="mt-4 space-y-1.5 border-t border-line pt-4">
                {project.repositoryUrl ? (
                  <Link href={project.repositoryUrl} icon="repo" label="Repositório" />
                ) : null}
                {project.productionUrl ? (
                  <Link href={project.productionUrl} icon="site" label="Ambiente" />
                ) : null}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <TasksPanel
            projectId={project.id}
            tasks={tasks.map((tarefa) => ({
              id: tarefa.id,
              title: tarefa.title,
              details: tarefa.details,
              kind: tarefa.kind,
              priority: tarefa.priority,
              status: tarefa.status,
              dueOn: tarefa.dueOn,
              billable: tarefa.billable,
            }))}
          />

          <section>
            <SectionTitle title="Horas registradas" hint={`${entries.length} sessões`} />
            <Panel>
              {entries.length ? (
                <div>
                  {entries.slice(0, 8).map((sessao) => (
                    <ListRow
                      key={sessao.id}
                      title={sessao.description}
                      subtitle={dateShort(sessao.workedOn as LocalDate)}
                      value={`${decimal(toHours(sessao.durationMilli as Milli), 2)} h`}
                      badge={!sessao.billable ? <Badge tone="neutral">não cobrável</Badge> : null}
                    />
                  ))}
                </div>
              ) : (
                <Empty icon={Clock} title="Nenhuma hora registrada" hint="Registre o tempo para comparar com o estimado." />
              )}
            </Panel>
          </section>
        </div>

        <ProposalsPanel
          projectId={project.id}
          proposals={detalhe.proposals.map((proposta) => ({
            id: proposta.id,
            title: proposta.title,
            amountCents: proposta.amountCents,
            status: proposta.status,
            sentOn: proposta.sentOn,
            decidedOn: proposta.decidedOn,
            deadlineDays: proposta.deadlineDays,
          }))}
        />

        {events.length ? (
          <section>
            <SectionTitle title="Histórico" />
            <Panel>
              <Timeline
                items={events.map((evento) => ({
                  id: evento.id,
                  when: dateShort(evento.occurredAt.slice(0, 10) as LocalDate),
                  title: evento.summary,
                  detail: evento.details ?? undefined,
                }))}
              />
            </Panel>
          </section>
        ) : null}
      </Stack>
    </Page>
  );
}

function Link({ href, icon, label }: { href: string; icon: "repo" | "site"; label: string }) {
  const Icone = icon === "repo" ? Github : ExternalLink;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-2 text-body-sm text-ink-muted transition-colors hover:text-accent"
    >
      <Icone size={14} strokeWidth={1.5} aria-hidden />
      <span className="truncate">{label}</span>
    </a>
  );
}
