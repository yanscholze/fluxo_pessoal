import Link from "next/link";

import { buildTripsView, type TripView } from "../../../server/services/trips.ts";
import { currentUser } from "../../auth-context.ts";
import { dateShort, money } from "../../ui/format.ts";
import { ArrowRight, Plane } from "../../ui/icons.tsx";
import { PanelHeading } from "../../ui/mesa.tsx";
import { Empty } from "../../ui/primitives.tsx";
import { TripForm } from "./trip-form.tsx";

export const dynamic = "force-dynamic";

/**
 * Viagens.
 *
 * Um cartão por viagem, com o período, o nome grande e o quanto já foi gasto.
 * A barra mede o gasto contra a maior viagem da lista — não contra um teto,
 * porque viagem não tem orçamento no Fluxo. É comparação entre elas, e o
 * rótulo diz isso.
 *
 * O cartão sobe um pixel ao passar o cursor, como no desenho. É o único
 * elemento da interface que faz isso, e por isso não vira utilitário: se um
 * dia outra tela precisar do mesmo gesto, o lugar dele é o CSS global.
 */
export default async function Viagens() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const view = await buildTripsView(user.id);
  const teto = Math.max(...view.trips.map((viagem) => viagem.totalCents), 1);

  return (
    <div className="content-area">
      {view.trips.length ? (
        <div className="grid gap-5 md:grid-cols-3">
          {view.trips.map((viagem) => (
            <CartaoDeViagem key={viagem.id} viagem={viagem} teto={teto} />
          ))}
        </div>
      ) : (
        <section className="glass-panel p-6">
          <Empty
            icon={Plane}
            title="Nenhuma viagem registrada"
            hint="Crie uma viagem para separar os gastos dela do seu mês normal."
          />
          <div className="mt-4">
            <TripForm />
          </div>
        </section>
      )}

      {view.trips.length ? (
        <section className="glass-panel mt-5 p-6">
          <PanelHeading
            titulo="Nova viagem"
            apoio="Gastos marcados numa viagem saem do seu mês normal"
            acao={<TripForm />}
          />
        </section>
      ) : null}
    </div>
  );
}

function CartaoDeViagem({ viagem, teto }: { viagem: TripView; teto: number }) {
  const fatia = (viagem.totalCents / teto) * 100;

  return (
    <section className="glass-panel cursor-pointer p-6 transition-transform hover:-translate-y-1">
      <Link href={`/viagens?viagem=${viagem.id}`} className="block w-full text-left">
        <div className="mb-12 flex justify-between">
          <Plane className="size-5 text-accent" aria-hidden />
          <ArrowRight className="size-4 text-ink-subtle" aria-hidden />
        </div>

        <p className="metric-label">
          {dateShort(viagem.startDate)} – {dateShort(viagem.endDate)}
        </p>
        <h3 className="mt-2 truncate text-xl font-medium text-ink">{viagem.name}</h3>
        <p className="tabular mt-4 text-body-sm text-ink-subtle">
          {money(viagem.totalCents)} em {viagem.transactionCount}{" "}
          {viagem.transactionCount === 1 ? "lançamento" : "lançamentos"}
        </p>

        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-inset">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.max(fatia, 2)}%` }}
          />
        </div>
      </Link>
    </section>
  );
}
