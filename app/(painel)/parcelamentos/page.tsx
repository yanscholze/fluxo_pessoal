import { buildInstallmentsView, type PlanView } from "../../../server/services/installments.ts";
import { listCategories } from "../../../server/repositories/catalog.ts";
import { currentUser } from "../../auth-context.ts";
import { moneyCompact, money } from "../../ui/format.ts";
import { Donut, PanelHeading } from "../../ui/mesa.tsx";
import { Empty } from "../../ui/primitives.tsx";
import { ChartColumn } from "../../ui/icons.tsx";
import ParcelamentosContent from "./content.tsx";

export const dynamic = "force-dynamic";

/**
 * Parcelamentos.
 *
 * O que já foi comprado e ainda está sendo pago. A rosca responde "quanto
 * disso ainda devo", as barras mostram em que categorias esse compromisso
 * está preso, e cada cartão abaixo é um plano com o seu progresso.
 *
 * A rosca do desenho mostra **dinheiro** no centro, não porcentagem — é a
 * única da interface que faz isso, e por isso o componente aceita uma legenda
 * livre. O anel continua medindo a fatia paga.
 */
export default async function Parcelamentos() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const [view, categorias] = await Promise.all([
    buildInstallmentsView(user.id),
    listCategories(user.id),
  ]);

  const nomeDaCategoria = new Map(categorias.map((categoria) => [categoria.id, categoria.name]));
  const porCategoria = agruparPorCategoria(view.active, nomeDaCategoria);
  const teto = Math.max(...porCategoria.map((linha) => linha.amountCents), 1);

  return (
    <div className="content-area">
      {view.active.length ? (
        <>
          <div className="grid gap-5 xl:grid-cols-[1fr_1.6fr]">
            <section className="glass-panel p-6">
              <PanelHeading titulo="Comprometimento por categoria" />
              <Donut
                percent={view.totals.percentPaid}
                legenda={moneyCompact(view.totals.openCents)}
              />
              <p className="mt-5 text-center text-caption text-ink-subtle">
                ainda a pagar de {money(view.totals.totalCents)}
              </p>
            </section>

            <section className="glass-panel p-6">
              <PanelHeading
                titulo="Total parcelado"
                apoio="Distribuição do saldo restante"
              />
              <div className="flex h-48 items-end gap-3 pt-4">
                {porCategoria.map((linha) => (
                  <div key={linha.name} className="group flex h-full flex-1 flex-col justify-end gap-3">
                    <div
                      className="relative h-full overflow-hidden rounded-xl bg-surface-inset"
                      title={`${linha.name}: ${money(linha.amountCents)}`}
                    >
                      <div
                        className="absolute inset-x-0 bottom-0 rounded-xl bg-accent/70 transition-all duration-500 group-hover:bg-accent"
                        style={{ height: `${Math.max((linha.amountCents / teto) * 100, 2)}%` }}
                      />
                    </div>
                    <span className="truncate text-center text-[10px] text-ink-subtle">
                      {linha.name}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {view.active.map((plano) => (
              <section key={plano.planId} className="glass-panel p-6">
                <p className="metric-label">
                  {plano.categoryId ? (nomeDaCategoria.get(plano.categoryId) ?? "Sem categoria") : "Sem categoria"}
                </p>
                <h3 className="mt-3 truncate text-lg font-medium text-ink">{plano.label}</h3>
                <p className="mt-1 text-body-sm text-ink-subtle">
                  {money(Math.round(plano.totalAmount / plano.totalCount))} por mês
                </p>

                <div className="mt-8 flex justify-between text-caption text-ink-muted">
                  <span>
                    {plano.paidCount} de {plano.totalCount} parcelas
                  </span>
                  <span className="tabular">{Math.round(plano.percentPaid)} %</span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-inset">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(plano.percentPaid, 2)}%` }}
                  />
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <section className="glass-panel p-6">
          <Empty
            icon={ChartColumn}
            title="Nenhuma compra parcelada em aberto"
            hint="Compras em mais de uma vez aparecem aqui com o progresso de pagamento."
          />
        </section>
      )}

      <div className="mt-5">
        <ParcelamentosContent />
      </div>
    </div>
  );
}

/**
 * Agrupa o saldo em aberto por categoria.
 *
 * Fica na tela por ser leitura de apresentação — não entra em nenhum total
 * que o produto mostre em outro lugar. Se um dia virar número citado fora
 * daqui, muda para o serviço.
 */
function agruparPorCategoria(
  planos: readonly PlanView[],
  nomes: Map<string, string>,
): { name: string; amountCents: number }[] {
  const mapa = new Map<string, number>();
  for (const plano of planos) {
    const nome = plano.categoryId ? (nomes.get(plano.categoryId) ?? "Sem categoria") : "Sem categoria";
    mapa.set(nome, (mapa.get(nome) ?? 0) + plano.openAmount);
  }
  return [...mapa.entries()]
    .map(([name, amountCents]) => ({ name, amountCents }))
    .sort((esquerda, direita) => direita.amountCents - esquerda.amountCents)
    .slice(0, 6);
}
