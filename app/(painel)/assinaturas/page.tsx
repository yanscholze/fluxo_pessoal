import { buildSubscriptionsReport } from "../../../server/services/subscriptions.ts";
import { currentUser } from "../../auth-context.ts";
import { money } from "../../ui/format.ts";
import { TrendingUp, Zap } from "../../ui/icons.tsx";
import { MetricTile } from "../../ui/mesa.tsx";
import { Empty } from "../../ui/primitives.tsx";
import AssinaturasContent from "./content.tsx";

export const dynamic = "force-dynamic";

/**
 * Assinaturas.
 *
 * O gasto que se renova sozinho — o mais fácil de esquecer e o que mais se
 * acumula. Três números no alto respondem quanto isso custa por mês, por ano,
 * e qual é a maior; abaixo, um cartão por assinatura.
 *
 * O custo anual não é o mensal vezes doze: assinatura anual já é anual, e a
 * conversão certa mora no serviço, que sabe o intervalo de cada uma.
 */
export default async function Assinaturas() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const relatorio = await buildSubscriptionsReport(user.id);
  const ativas = relatorio.subscriptions.filter((assinatura) => assinatura.isActive);
  const maior = ativas.reduce<(typeof ativas)[number] | null>(
    (recorde, atual) => (recorde === null || atual.monthlyCents > recorde.monthlyCents ? atual : recorde),
    null,
  );

  return (
    <div className="content-area">
      <div className="grid gap-5 md:grid-cols-3">
        <MetricTile
          tom="accent"
          icone={<Zap className="size-4" aria-hidden />}
          rotulo="Total mensal"
          valor={money(relatorio.totals.monthlyCents)}
          apoio={`${relatorio.totals.activeCount} ativas${relatorio.totals.pausedCount ? ` · ${relatorio.totals.pausedCount} pausadas` : ""}`}
        />
        <MetricTile
          tom="negative"
          icone={<TrendingUp className="size-4" aria-hidden />}
          rotulo="Custo anual"
          valor={money(relatorio.totals.yearlyCents)}
          apoio="Mensais somadas doze vezes, anuais uma"
        />
        <MetricTile
          tom="caution"
          icone={<TrendingUp className="size-4" aria-hidden />}
          rotulo="Maior assinatura"
          valor={maior ? money(maior.monthlyCents) : "—"}
          apoio={maior?.description ?? "Nenhuma assinatura ativa"}
        />
      </div>

      {ativas.length ? (
        <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {ativas.map((assinatura) => (
            <section key={assinatura.id} className="glass-panel p-6">
              <div
                className="mb-8 grid size-11 place-items-center rounded-xl"
                style={{
                  background: assinatura.label
                    ? `color-mix(in oklab, ${assinatura.label.color} 12%, transparent)`
                    : "var(--color-accent-wash)",
                  color: assinatura.label?.color ?? "var(--color-accent)",
                }}
              >
                <Zap className="size-5" aria-hidden />
              </div>
              <p className="metric-label">{assinatura.label?.name ?? "Sem etiqueta"}</p>
              <h3 className="mt-2 truncate font-medium text-ink">{assinatura.description}</h3>
              <p className="tabular mt-6 text-xl text-ink">
                {money(assinatura.monthlyCents)}
                <small className="ml-1 text-caption text-ink-subtle">/ mês</small>
              </p>
              <p className="mt-2 text-caption text-ink-subtle">
                {money(assinatura.yearlyCents)} por ano
              </p>
            </section>
          ))}
        </div>
      ) : (
        <section className="glass-panel mt-5 p-6">
          <Empty
            icon={Zap}
            title="Nenhuma assinatura ativa"
            hint="Cadastre as recorrências que se renovam sozinhas para ver quanto elas custam por ano."
          />
        </section>
      )}

      <div className="mt-5">
        <AssinaturasContent />
      </div>
    </div>
  );
}
