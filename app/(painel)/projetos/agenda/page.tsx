import { addDays, type LocalDate } from "../../../../core/time/local-date.ts";
import { buildAgenda } from "../../../../server/services/work.ts";
import { currentUser } from "../../../auth-context.ts";
import { MetricStrip } from "../../../ui/data-display.tsx";
import { date, dateShort, money, relativeDay, weekdayShort } from "../../../ui/format.ts";
import { Calendar, CircleAlert, FileText, Flag, Wallet } from "../../../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../../../ui/page-frame.tsx";
import { Badge, Empty, Panel, join, type Tone } from "../../../ui/primitives.tsx";
import { WorkNav } from "../work-nav.tsx";

export const dynamic = "force-dynamic";

const TIPO: Record<string, { label: string; tone: Tone; icon: typeof Wallet }> = {
  task: { label: "Prazo", tone: "neutral", icon: Flag },
  payment: { label: "Cobrança", tone: "accent", icon: Wallet },
  delivery: { label: "Entrega", tone: "info", icon: Calendar },
  proposal: { label: "Proposta", tone: "caution", icon: FileText },
};

/**
 * Agenda da área de trabalho.
 *
 * Prazo de tarefa, vencimento de parcela, entrega e proposta esperando resposta
 * no mesmo calendário, porque disputam os mesmos dias. Quatro listas separadas
 * escondem justamente o que a agenda existe para mostrar: a semana em que a
 * entrega, a cobrança e o prazo caem juntos.
 *
 * O agrupamento é por dia, e não por semana ou mês: o compromisso tem data, e
 * a decisão que se toma aqui — o que empurrar — é sempre sobre um dia.
 */
export default async function Agenda() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const view = await buildAgenda(user.id);

  const atrasados = view.items.filter((item) => item.isLate);
  const daSemana = view.items.filter(
    (item) => !item.isLate && item.on <= addDays(view.today, 7) && !item.isDone,
  );
  const aReceber = view.items
    .filter((item) => item.kind === "payment" && !item.isDone)
    .reduce((soma, item) => soma + (item.amountCents ?? 0), 0);

  // Agrupa por dia preservando a ordem cronológica que o serviço já entregou.
  const porDia = new Map<LocalDate, typeof view.items>();
  for (const item of view.items) {
    porDia.set(item.on, [...(porDia.get(item.on) ?? []), item]);
  }

  return (
    <Page>
      <PageHeader
        title="Agenda"
        description="Prazo, cobrança, entrega e proposta no mesmo calendário — porque disputam os mesmos dias."
      >
        <WorkNav />
      </PageHeader>

      <Stack gap="lg">
        <MetricStrip
          metrics={[
            {
              label: "Atrasado",
              value: String(atrasados.length),
              icon: CircleAlert,
              tone: atrasados.length ? "negative" : "positive",
              hint: atrasados.length ? "Data já passou e continua em aberto" : "Nada vencido",
            },
            {
              label: "Nos próximos 7 dias",
              value: String(daSemana.length),
              icon: Calendar,
              hint: daSemana.length ? "Compromissos desta semana" : "Semana livre",
            },
            {
              label: "A receber",
              value: money(aReceber),
              icon: Wallet,
              tone: aReceber > 0 ? "positive" : "neutral",
              hint: "Parcelas ainda não recebidas na janela",
            },
            {
              label: "Na janela",
              value: String(view.items.length),
              hint: "Próximos 90 dias",
            },
          ]}
        />

        {view.items.length ? (
          <Panel>
            <ol className="divide-y divide-line">
              {[...porDia].map(([dia, doDia]) => {
                const passado = dia < view.today;
                const hoje = dia === view.today;

                return (
                  <li key={dia} className="flex flex-col gap-2 py-3 sm:flex-row sm:gap-4">
                    <div className="flex shrink-0 items-baseline gap-2 sm:w-40 sm:flex-col sm:items-start sm:gap-0.5">
                      <span
                        className={join(
                          "text-body-sm font-medium",
                          hoje ? "text-accent" : passado ? "text-negative" : "text-ink",
                        )}
                      >
                        {date(dia)}
                      </span>
                      <span className="text-caption text-ink-subtle">
                        {weekdayShort(dia)} · {relativeDay(dia, view.today)}
                      </span>
                    </div>

                    <ul className="min-w-0 flex-1 space-y-2">
                      {doDia.map((item) => {
                        const tipo = TIPO[item.kind];
                        const Icone = tipo.icon;

                        return (
                          <li key={item.id} className="flex items-start gap-2.5">
                            <Icone
                              className={join(
                                "mt-0.5 size-4 shrink-0",
                                item.isLate ? "text-negative" : "text-ink-subtle",
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={join(
                                    "text-body-sm",
                                    item.isDone ? "text-ink-subtle line-through" : "text-ink",
                                  )}
                                >
                                  {item.title}
                                </span>
                                <Badge tone={item.isLate ? "negative" : tipo.tone}>
                                  {item.isLate ? "atrasado" : tipo.label}
                                </Badge>
                                {item.isDone ? <Badge tone="positive">resolvido</Badge> : null}
                              </p>
                              {item.projectName ? (
                                <p className="flex items-center gap-1.5 text-caption text-ink-subtle">
                                  <span
                                    className="size-2 shrink-0 rounded-full"
                                    style={{
                                      backgroundColor: item.projectColor ?? "var(--color-line-strong)",
                                    }}
                                    aria-hidden
                                  />
                                  <span className="truncate">
                                    {item.projectName}
                                    {item.clientName ? ` · ${item.clientName}` : ""}
                                  </span>
                                </p>
                              ) : null}
                            </div>

                            {item.amountCents !== null ? (
                              <span className="tabular shrink-0 text-body-sm text-ink">
                                {money(item.amountCents)}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ol>
          </Panel>
        ) : (
          <Panel>
            <Empty
              icon={Calendar}
              title="Nada marcado nos próximos 90 dias"
              hint={`Prazos de tarefa, vencimentos de parcela e entregas aparecem aqui. Hoje é ${dateShort(view.today)}.`}
            />
          </Panel>
        )}
      </Stack>
    </Page>
  );
}
