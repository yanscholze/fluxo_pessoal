import { redirect } from "next/navigation";

import { buildGoalsView } from "../../../server/services/goals.ts";
import { currentUser } from "../../auth-context.ts";
import { Badge, Card, Empty, Figure, Label, Meter } from "../../ui/primitives.tsx";
import { competenceLong, date, money, percent } from "../../ui/format.ts";
import { GoalForm } from "./goal-form.tsx";

export const dynamic = "force-dynamic";

export default async function Metas() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildGoalsView(user.id);

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Metas</h1>
          <p className="mt-1 text-[0.875rem] text-ink-muted">Quanto falta e quando fica pronto.</p>
        </div>
        <GoalForm accounts={view.accounts} />
      </header>

      {view.goals.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card as="article">
              <Label>Guardado</Label>
              <Figure value={money(view.totals.currentCents)} size="sm" tone="positive" className="mt-1.5" />
              <p className="mt-2 text-[0.75rem] text-ink-subtle">de {money(view.totals.targetCents)} somados</p>
            </Card>
            <Card as="article">
              <Label>Ainda falta</Label>
              <Figure value={money(view.totals.remainingCents)} size="sm" className="mt-1.5" />
            </Card>
            <Card as="article">
              <Label>Compromisso mensal</Label>
              <Figure value={money(view.totals.monthlyCommitmentCents)} size="sm" className="mt-1.5" />
              <p className="mt-2 text-[0.75rem] text-ink-subtle">
                {view.totals.activeCount} em aberto · {view.totals.achievedCount} alcançada
                {view.totals.achievedCount === 1 ? "" : "s"}
              </p>
            </Card>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {view.goals.map((meta) => (
              <Card key={meta.goalId} as="article">
                <header className="flex items-start justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
                    <h2 className="text-[0.9375rem] font-semibold text-ink">{meta.name}</h2>
                    {meta.isAchieved ? <Badge tone="positive">alcançada</Badge> : null}
                    {meta.behindSchedule ? <Badge tone="caution">atrás do prazo</Badge> : null}
                  </span>
                  <span className="tabular shrink-0 text-[1.125rem] font-semibold text-ink">
                    {percent(meta.percent)}
                  </span>
                </header>

                <p className="tabular mt-2 text-[0.875rem] text-ink">
                  {money(meta.current)}{" "}
                  <span className="text-ink-subtle">/ {money(meta.target)}</span>
                </p>

                <div className="mt-2">
                  <Meter
                    value={meta.current}
                    total={meta.target}
                    tone={meta.isAchieved ? "positive" : meta.behindSchedule ? "caution" : "accent"}
                    label={meta.name}
                  />
                </div>

                <dl className="mt-3 space-y-1 text-[0.75rem]">
                  {!meta.isAchieved ? (
                    <Linha rotulo="Falta" valor={money(meta.remaining)} />
                  ) : null}
                  {meta.monthlyContribution > 0 ? (
                    <Linha rotulo="Aporte mensal" valor={money(meta.monthlyContribution)} />
                  ) : null}
                  {meta.forecast && !meta.isAchieved ? (
                    <Linha rotulo="Conclusão prevista" valor={competenceLong(meta.forecast)} />
                  ) : null}
                  {meta.targetDate ? <Linha rotulo="Prazo desejado" valor={date(meta.targetDate)} /> : null}
                  {meta.behindSchedule && meta.requiredMonthly ? (
                    <Linha
                      rotulo="Precisaria por mês"
                      valor={money(meta.requiredMonthly)}
                      tom="text-caution"
                    />
                  ) : null}
                  {meta.accountName ? <Linha rotulo="Lastreada por" valor={meta.accountName} /> : null}
                </dl>

                {meta.behindSchedule && meta.requiredMonthly ? (
                  <p className="mt-3 rounded-[--radius-control] bg-caution-wash px-3 py-2 text-[0.75rem] text-caution">
                    No aporte atual a meta fecha em {meta.forecast ? competenceLong(meta.forecast) : "prazo indefinido"},
                    depois do prazo. Aportar {money(meta.requiredMonthly)} por mês alcança a data.
                  </p>
                ) : null}
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Card>
          <Empty
            title="Nenhuma meta cadastrada"
            hint="Defina um objetivo e o Fluxo calcula quando ele fecha no seu ritmo de aporte."
          />
        </Card>
      )}
    </main>
  );
}

function Linha({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-subtle">{rotulo}</dt>
      <dd className={`tabular ${tom ?? "text-ink"}`}>{valor}</dd>
    </div>
  );
}
