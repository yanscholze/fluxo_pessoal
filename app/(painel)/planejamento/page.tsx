import { buildDashboard } from "../../../server/services/dashboard.ts";
import { buildPlanningView } from "../../../server/services/planning.ts";
import { currentUser } from "../../auth-context.ts";
import { money } from "../../ui/format.ts";
import { Gauge, TrendingDown, TrendingUp } from "../../ui/icons.tsx";
import { MetricTile, PanelHeading } from "../../ui/mesa.tsx";
import { Empty } from "../../ui/primitives.tsx";
import RecorrenciasContent from "./content.tsx";

export const dynamic = "force-dynamic";

/**
 * Compromissos.
 *
 * O que já está prometido antes de o mês começar: recorrências, faturas e
 * contas previstas. Três números respondem se o mês fecha — renda prevista,
 * já comprometido, margem projetada — e o calendário mostra em que dia cada
 * compromisso cai.
 *
 * Na navegação do Mesa, parcelamentos e assinaturas são telas próprias. Esta
 * ficou com o que sobra e é o miolo: a regra que se repete todo mês.
 */
export default async function Compromissos() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const [planejamento, painel] = await Promise.all([
    buildPlanningView(user.id),
    buildDashboard(user.id),
  ]);

  const mes = planejamento.projection[0] ?? null;
  const compromissos = painel.upcoming.slice(0, 8);

  return (
    <div className="content-area">
      <div className="grid gap-5 md:grid-cols-3">
        <MetricTile
          tom="positive"
          icone={<TrendingUp className="size-4" aria-hidden />}
          rotulo="Renda prevista"
          valor={mes ? money(mes.incomeCents) : "—"}
          apoio="Receitas recorrentes da competência"
        />
        <MetricTile
          tom="negative"
          icone={<TrendingDown className="size-4" aria-hidden />}
          rotulo="Já comprometido"
          valor={mes ? money(mes.committedCents) : "—"}
          apoio="Recorrências, faturas e parcelas"
        />
        <MetricTile
          tom="accent"
          icone={<Gauge className="size-4" aria-hidden />}
          rotulo="Margem projetada"
          valor={mes ? money(mes.freeCents) : "—"}
          apoio={mes ? `${mes.businessDays} dias úteis no mês` : "Sem projeção para este mês"}
        />
      </div>

      <section className="glass-panel mt-5 p-6">
        <PanelHeading
          titulo="Calendário de compromissos"
          apoio="Próximos lançamentos previstos"
        />
        {compromissos.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {compromissos.map((item) => (
              <div
                key={`${item.transactionId}-${item.dueOn}`}
                className="flex items-center gap-4 rounded-xl border border-line p-4"
              >
                <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface-inset text-center text-caption font-medium leading-tight text-ink">
                  {diaEMes(item.dueOn)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-medium text-ink">{item.description}</p>
                  <p className="text-caption text-ink-subtle">
                    {item.kind === "income" ? "Entrada prevista" : "Previsto"}
                  </p>
                </div>
                <p
                  className={
                    item.kind === "income"
                      ? "tabular shrink-0 text-body-sm text-positive"
                      : "tabular shrink-0 text-body-sm text-ink"
                  }
                >
                  {money(item.amountCents)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="Nada previsto para os próximos dias"
            hint="Cadastre recorrências para o Fluxo projetar salário, contas fixas e assinaturas."
          />
        )}
      </section>

      <div className="mt-5">
        <RecorrenciasContent />
      </div>
    </div>
  );
}

/** "22 set" em duas linhas, como no desenho. */
function diaEMes(data: string): string {
  const formatada = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${data}T12:00:00Z`));
  return formatada.replace(".", "").replace(" de ", " ");
}
