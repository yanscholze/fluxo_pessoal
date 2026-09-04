import { buildGoalsView } from "../../../server/services/goals.ts";
import { currentUser } from "../../auth-context.ts";
import { ProgressRing } from "../../ui/charts.tsx";
import { KeyValue, MetricStrip } from "../../ui/data-display.tsx";
import { competenceLong, date, money, percent } from "../../ui/format.ts";
import { CircleCheck, PiggyBank, Target, TrendingUp } from "../../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../../ui/page-frame.tsx";
import { Badge, Empty, Notice, Panel } from "../../ui/primitives.tsx";
import { GoalForm } from "./goal-form.tsx";

export const dynamic = "force-dynamic";

/**
 * Metas.
 *
 * O anel responde "quanto já andei" de longe; a ficha ao lado responde "o que
 * falta e quando fecha" de perto. Deliberadamente sem comemoração gráfica: o
 * usuário está olhando dinheiro que ainda não juntou, e confete não ajuda a
 * juntar.
 */
export default async function Metas() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const view = await buildGoalsView(user.id);

  return (
    <Page>
      <PageHeader
        title="Metas"
        description="Quanto falta, em quanto tempo fecha no seu ritmo, e o que precisaria mudar para fechar antes."
        actions={<GoalForm accounts={view.accounts} />}
      />

      {view.goals.length ? (
        <Stack gap="lg">
          <MetricStrip
            metrics={[
              {
                label: "Guardado",
                value: money(view.totals.currentCents),
                tone: "positive",
                icon: PiggyBank,
                hint: `de ${money(view.totals.targetCents)} somados entre as metas`,
              },
              {
                label: "Ainda falta",
                value: money(view.totals.remainingCents),
                icon: Target,
                hint: "Distância até o objetivo de todas as metas",
              },
              {
                label: "Compromisso mensal",
                value: money(view.totals.monthlyCommitmentCents),
                icon: TrendingUp,
                hint: "Soma dos aportes que você definiu",
              },
              {
                label: "Situação",
                value: `${view.totals.activeCount} em aberto`,
                tone: view.totals.achievedCount > 0 ? "positive" : "neutral",
                icon: CircleCheck,
                hint: `${view.totals.achievedCount} alcançada${view.totals.achievedCount === 1 ? "" : "s"}`,
              },
            ]}
          />

          <div className="grid gap-5 lg:grid-cols-2">
            {view.goals.map((meta) => (
              <Panel key={meta.goalId} as="article">
                <header className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-heading text-ink">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: meta.color }}
                        aria-hidden
                      />
                      <span className="truncate">{meta.name}</span>
                      {meta.isAchieved ? <Badge tone="positive">alcançada</Badge> : null}
                      {meta.behindSchedule ? <Badge tone="caution">atrás do prazo</Badge> : null}
                    </h2>
                    <p className="tabular mt-1.5 text-figure-sm text-ink">
                      {money(meta.current)}
                      <span className="text-body-sm font-normal text-ink-subtle"> de {money(meta.target)}</span>
                    </p>
                  </div>

                  <ProgressRing
                    percent={meta.percent}
                    size={76}
                    thickness={7}
                    tone={meta.isAchieved ? "positive" : meta.behindSchedule ? "caution" : "accent"}
                    label={meta.name}
                  />
                </header>

                <KeyValue
                  className="mt-4"
                  entries={[
                    ...(meta.isAchieved
                      ? []
                      : [{ label: "Falta", value: <span className="tabular">{money(meta.remaining)}</span> }]),
                    ...(meta.monthlyContribution > 0
                      ? [
                          {
                            label: "Aporte mensal",
                            value: <span className="tabular">{money(meta.monthlyContribution)}</span>,
                          },
                        ]
                      : []),
                    ...(meta.forecast && !meta.isAchieved
                      ? [{ label: "Conclusão prevista", value: competenceLong(meta.forecast) }]
                      : []),
                    ...(meta.targetDate ? [{ label: "Prazo desejado", value: date(meta.targetDate) }] : []),
                    ...(meta.accountName ? [{ label: "Lastreada por", value: meta.accountName }] : []),
                  ]}
                />

                {meta.behindSchedule && meta.requiredMonthly ? (
                  <div className="mt-4">
                    <Notice tone="caution">
                      No aporte atual a meta fecha em{" "}
                      {meta.forecast ? competenceLong(meta.forecast) : "prazo indefinido"}, depois do prazo.
                      Aportar <span className="tabular font-medium">{money(meta.requiredMonthly)}</span> por mês
                      alcança a data.
                    </Notice>
                  </div>
                ) : null}

                <p className="mt-3 text-caption text-ink-subtle">
                  {percent(meta.percent)} do objetivo concluído
                </p>
              </Panel>
            ))}
          </div>
        </Stack>
      ) : (
        <Panel>
          <Empty
            icon={Target}
            title="Nenhuma meta cadastrada"
            hint="Defina um objetivo e o Fluxo calcula quando ele fecha no seu ritmo de aporte."
          />
        </Panel>
      )}
    </Page>
  );
}
