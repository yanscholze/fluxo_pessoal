import { redirect } from "next/navigation";

import { buildPlanningView } from "../../../server/services/planning.ts";
import { currentUser } from "../../auth-context.ts";
import { Badge, Card, Empty, Figure, Label, SectionHeading } from "../../ui/primitives.tsx";
import { competenceShort, date, money, relativeDay } from "../../ui/format.ts";
import { ConfirmOccurrence } from "./confirm-occurrence.tsx";
import { NewRecurrence } from "./new-recurrence.tsx";

export const dynamic = "force-dynamic";

const ROTULO_PAPEL: Record<string, string> = {
  salary: "Salário",
  benefit: "Benefício",
  subscription: "Assinatura",
  standard: "Recorrente",
};

export default async function Planejamento() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildPlanningView(user.id);
  const pendentes = view.recurrences.filter((item) => item.pending && item.isActive);

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Planejamento</h1>
          <p className="mt-1 text-[0.875rem] text-ink-muted">
            O que se repete todo mês e como os próximos meses ficam por causa disso.
          </p>
        </div>
        <NewRecurrence options={view.options} />
      </header>

      {pendentes.length ? (
        <Card className="mb-5 border-caution/30 bg-caution-wash">
          <SectionHeading
            title="Aguardando confirmação"
            hint="Estas ocorrências já deveriam ter acontecido nesta competência"
          />
          <ul className="space-y-2">
            {pendentes.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[0.875rem] text-ink">
                  {item.description}
                  <span className="ml-2 text-[0.75rem] text-ink-subtle">
                    {date(item.pending!.date)} · {money(item.pending!.amountCents)}
                  </span>
                </span>
                <ConfirmOccurrence
                  recurrenceId={item.id}
                  competence={item.pending!.competence}
                  amountCents={item.pending!.amountCents}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <SectionHeading
          title="Projeção"
          hint="Renda prevista, o que já está comprometido e o que sobra em cada mês"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-[0.8125rem]">
            <thead>
              <tr className="border-b border-line text-left text-ink-subtle">
                <th className="py-2 pr-3 font-medium">Mês</th>
                <th className="px-3 py-2 text-right font-medium">Renda prevista</th>
                <th className="px-3 py-2 text-right font-medium">Comprometido</th>
                <th className="px-3 py-2 text-right font-medium">Sobra</th>
                <th className="py-2 pl-3 text-right font-medium">Dias úteis</th>
              </tr>
            </thead>
            <tbody>
              {view.projection.map((mes) => (
                <tr key={mes.competence} className="border-b border-line last:border-0">
                  <td className="py-2 pr-3 text-ink">{competenceShort(mes.competence)}</td>
                  <td className="tabular px-3 py-2 text-right text-positive">{money(mes.incomeCents)}</td>
                  <td className="tabular px-3 py-2 text-right text-ink">{money(mes.committedCents)}</td>
                  <td
                    className={`tabular px-3 py-2 text-right font-medium ${
                      mes.freeCents < 0 ? "text-negative" : "text-ink"
                    }`}
                  >
                    {money(mes.freeCents, { signed: true })}
                  </td>
                  <td className="tabular py-2 pl-3 text-right text-ink-subtle">{mes.businessDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <SectionHeading title="Recorrências" hint="Regras que projetam os lançamentos futuros" />
            {view.recurrences.length ? (
              <ul>
                {view.recurrences.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[0.875rem] text-ink">
                        {item.description}
                        <Badge tone={item.kind === "income" ? "positive" : "neutral"}>
                          {ROTULO_PAPEL[item.role] ?? item.role}
                        </Badge>
                        {!item.isActive ? <Badge tone="caution">pausada</Badge> : null}
                        {item.interval === "yearly" ? <Badge>anual</Badge> : null}
                      </p>
                      <p className="mt-0.5 text-[0.75rem] text-ink-subtle">
                        {item.scheduleLabel} · {item.originName}
                        {item.categoryName ? ` · ${item.categoryName}` : ""}
                        {item.amountMode === "per_business_day" ? " · por dia útil" : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-[0.875rem] text-ink">
                        {money(item.next?.amountCents ?? item.amountCents)}
                      </p>
                      {item.next ? (
                        <p className="text-[0.75rem] text-ink-subtle">
                          {date(item.next.date)} · {relativeDay(item.next.date, view.today)}
                        </p>
                      ) : (
                        <p className="text-[0.75rem] text-ink-subtle">encerrada</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                title="Nenhuma recorrência cadastrada"
                hint="Cadastre salário, contas fixas e assinaturas para o Fluxo projetar os próximos meses."
              />
            )}
          </Card>
        </div>

        <Card>
          <SectionHeading title="Assinaturas" />
          {view.subscriptions.activeCount ? (
            <>
              <Label>Custo mensal</Label>
              <Figure value={money(view.subscriptions.monthlyCents)} size="sm" className="mt-1.5" />
              <p className="mt-2 text-[0.75rem] text-ink-subtle">
                {money(view.subscriptions.yearlyCents)} por ano · {view.subscriptions.activeCount} ativa
                {view.subscriptions.activeCount > 1 ? "s" : ""}
              </p>

              {view.subscriptions.next7DaysCents > 0 ? (
                <p className="mt-3 rounded-[--radius-control] bg-surface-sunken px-3 py-2 text-[0.8125rem] text-ink">
                  Próximos 7 dias: {money(view.subscriptions.next7DaysCents)}
                </p>
              ) : null}

              {view.subscriptions.upcoming.length ? (
                <ul className="mt-3">
                  {view.subscriptions.upcoming.slice(0, 6).map((cobranca) => (
                    <li
                      key={`${cobranca.recurrenceId}-${cobranca.date}`}
                      className="flex items-center justify-between gap-3 border-b border-line py-2 text-[0.8125rem] last:border-0"
                    >
                      <span className="truncate text-ink">{cobranca.description}</span>
                      <span className="shrink-0 text-right">
                        <span className="tabular block text-ink">{money(cobranca.amountCents)}</span>
                        <span className="block text-[0.6875rem] text-ink-subtle">{date(cobranca.date)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <Empty
              title="Nenhuma assinatura"
              hint="Cadastre uma recorrência com o papel Assinatura para ver o custo total aqui."
            />
          )}
        </Card>
      </div>
    </main>
  );
}
