import { redirect } from "next/navigation";

import { parseCompetence } from "../../../core/time/competence.ts";
import { listCategories } from "../../../server/repositories/catalog.ts";
import { buildBudgetsView } from "../../../server/services/budgets.ts";
import { currentUser } from "../../auth-context.ts";
import { Badge, Card, Empty, Figure, Label, Meter, SectionHeading } from "../../ui/primitives.tsx";
import { competenceLong, money, percent } from "../../ui/format.ts";
import { BudgetForm } from "./budget-form.tsx";

export const dynamic = "force-dynamic";

export default async function Orcamentos({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const params = await searchParams;
  const [view, categories] = await Promise.all([
    buildBudgetsView(user.id, parseCompetence(params.competencia) ?? undefined),
    listCategories(user.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label uppercase text-ink-subtle">{competenceLong(view.competence)}</p>
          <h1 className="mt-1 text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Orçamentos</h1>
          <p className="mt-1 text-[0.875rem] text-ink-muted">Quanto ainda dá para gastar em cada categoria.</p>
        </div>
        <BudgetForm
          categories={categories
            .filter((category) => category.kind === "expense")
            .map((category) => ({ id: category.id, name: category.name }))}
        />
      </header>

      {view.budgets.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card as="article">
              <Label>Ainda disponível</Label>
              <Figure
                value={money(view.totals.available)}
                size="sm"
                tone={view.totals.available === 0 ? "negative" : "neutral"}
                className="mt-1.5"
              />
              <div className="mt-3">
                <Meter
                  value={view.totals.spent}
                  total={view.totals.amount}
                  tone={view.totals.percentUsed > 100 ? "negative" : "accent"}
                  label="Uso do orçamento"
                />
                <p className="mt-1.5 text-[0.75rem] text-ink-subtle">
                  {money(view.totals.spent)} de {money(view.totals.amount)} · {percent(view.totals.percentUsed)}
                </p>
              </div>
            </Card>
            <Card as="article">
              <Label>Estourados</Label>
              <Figure
                value={String(view.totals.exceededCount)}
                size="sm"
                tone={view.totals.exceededCount > 0 ? "negative" : "neutral"}
                className="mt-1.5"
              />
              <p className="mt-2 text-[0.75rem] text-ink-subtle">Já passaram do valor definido</p>
            </Card>
            <Card as="article">
              <Label>Em risco</Label>
              <Figure
                value={String(view.totals.atRiskCount)}
                size="sm"
                tone={view.totals.atRiskCount > 0 ? "caution" : "neutral"}
                className="mt-1.5"
              />
              <p className="mt-2 text-[0.75rem] text-ink-subtle">No ritmo atual, estouram até o fim do mês</p>
            </Card>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {view.budgets.map((item) => {
              const estourou = item.spent > item.amount;
              return (
                <Card key={item.budgetId} as="article">
                  <header className="flex items-start justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: item.categoryColor }}
                        aria-hidden
                      />
                      <h2 className="text-[0.9375rem] font-semibold text-ink">{item.categoryName}</h2>
                      {estourou ? <Badge tone="negative">estourou</Badge> : null}
                      {!estourou && item.willExceed ? <Badge tone="caution">em risco</Badge> : null}
                    </span>
                    <span className="text-right">
                      <span
                        className={`tabular block text-[1.125rem] font-semibold ${
                          estourou ? "text-negative" : "text-ink"
                        }`}
                      >
                        {money(item.available)}
                      </span>
                      <span className="block text-[0.6875rem] text-ink-subtle">disponível</span>
                    </span>
                  </header>

                  <div className="mt-3">
                    <Meter
                      value={item.spent}
                      total={item.amount}
                      tone={estourou ? "negative" : item.willExceed ? "caution" : "accent"}
                      label={item.categoryName}
                    />
                    <p className="mt-1.5 text-[0.75rem] text-ink-subtle">
                      {money(item.spent)} de {money(item.amount)} · {percent(item.percentUsed)} · dia{" "}
                      {item.daysElapsed} de {item.daysInMonth}
                    </p>
                  </div>

                  {item.willExceed && !estourou ? (
                    <p className="mt-2 rounded-[--radius-control] bg-caution-wash px-3 py-2 text-[0.75rem] text-caution">
                      No ritmo atual o mês fecha em {money(item.projected)} — {money(item.projected - item.amount)}{" "}
                      acima do orçamento.
                    </p>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <Card>
          <Empty
            title="Nenhum orçamento definido"
            hint="Defina um teto por categoria para o Fluxo avisar antes de estourar, não depois."
          />
        </Card>
      )}

      {view.uncovered.length ? (
        <Card className="mt-5">
          <SectionHeading
            title="Categorias sem orçamento"
            hint="Já tiveram gasto neste mês e não têm teto definido"
          />
          <ul>
            {view.uncovered.map((item) => (
              <li
                key={item.categoryId}
                className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
              >
                <span className="flex items-center gap-2 text-[0.8125rem] text-ink">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: item.color }}
                    aria-hidden
                  />
                  {item.name}
                </span>
                <span className="tabular text-[0.8125rem] text-ink-muted">{money(item.spentCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </main>
  );
}
