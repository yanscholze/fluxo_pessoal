import { competenceOf, parseCompetence } from "../../../core/time/competence.ts";
import { listCategories } from "../../../server/repositories/catalog.ts";
import { type BudgetView, buildBudgetsView } from "../../../server/services/budgets.ts";
import { currentUser } from "../../auth-context.ts";
import { competenceLong, money } from "../../ui/format.ts";
import { Target } from "../../ui/icons.tsx";
import { PanelHeading } from "../../ui/mesa.tsx";
import { Empty } from "../../ui/primitives.tsx";
import { BudgetForm } from "./budget-form.tsx";

export const dynamic = "force-dynamic";

/**
 * Orçamentos.
 *
 * Um cartão por categoria com teto: quanto já saiu, de quanto, e a barra.
 *
 * **A barra fica coral acima de 75%.** No desenho é o único momento em que a
 * cor sai do acento, e é o aviso chegando antes do estouro — vermelho só em
 * 100% avisaria quando já não há o que fazer. O percentual sozinho não basta:
 * quem gastou 60% no dia 10 já está em rota de estouro e nada fica vermelho.
 */
export default async function Orcamentos({
  searchParams,
}: {
  searchParams: Promise<{ competencia?: string }>;
}) {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const params = await searchParams;
  const competencia = parseCompetence(params.competencia) ?? competenceOf(new Date().toISOString().slice(0, 10) as never);
  const [view, categorias] = await Promise.all([
    buildBudgetsView(user.id, competencia),
    listCategories(user.id),
  ]);

  return (
    <div className="content-area">
      {view.budgets.length ? (
        <div className="grid gap-5 md:grid-cols-2">
          {view.budgets.map((orcamento) => (
            <CartaoDeOrcamento key={orcamento.budgetId} orcamento={orcamento} categorias={categorias} />
          ))}
        </div>
      ) : (
        <section className="glass-panel p-6">
          <Empty
            icon={Target}
            title="Nenhum orçamento definido"
            hint="Defina um teto por categoria para o Fluxo avisar antes de estourar."
          />
          <div className="mt-4">
            <BudgetForm categories={categorias} />
          </div>
        </section>
      )}

      {view.uncovered.length ? (
        <section className="glass-panel mt-5 p-6">
          <PanelHeading
            titulo="Categorias sem teto"
            apoio={`Gastaram em ${competenceLong(view.competence).toLowerCase()} e não têm orçamento`}
            acao={<BudgetForm categories={categorias} />}
          />
          <div className="divide-y divide-line">
            {view.uncovered.map((categoria) => (
              <div
                key={categoria.categoryId}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3.5"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: categoria.color, boxShadow: "0 0 10px currentColor" }}
                  aria-hidden
                />
                <p className="truncate text-body-sm text-ink">{categoria.name}</p>
                <p className="tabular text-body-sm text-ink-subtle">{money(categoria.spentCents)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Acima disto a barra muda de cor: o aviso chega antes do estouro. */
const LIMIAR_DE_ALERTA = 75;

function CartaoDeOrcamento({
  orcamento,
  categorias,
}: {
  orcamento: BudgetView;
  categorias: Awaited<ReturnType<typeof listCategories>>;
}) {
  const apertado = orcamento.percentUsed >= LIMIAR_DE_ALERTA;

  return (
    <section className="glass-panel p-6">
      <div className="flex justify-between">
        <div className="min-w-0">
          <p className="metric-label">Orçamento</p>
          <h3 className="mt-2 truncate text-lg font-medium text-ink">{orcamento.categoryName}</h3>
        </div>
        <BudgetForm categories={categorias} />
      </div>

      <div className="mt-8 flex items-end justify-between">
        <p className="tabular text-2xl text-ink">{money(orcamento.spent)}</p>
        <p className="tabular text-body-sm text-ink-subtle">de {money(orcamento.amount)}</p>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-inset">
        <div
          className={apertado ? "h-full rounded-full bg-negative" : "h-full rounded-full bg-accent"}
          style={{ width: `${Math.min(Math.max(orcamento.percentUsed, 2), 100)}%` }}
        />
      </div>

      <p className="mt-3 text-right text-caption text-ink-subtle">
        {Math.round(orcamento.percentUsed)} % utilizado
      </p>
    </section>
  );
}
