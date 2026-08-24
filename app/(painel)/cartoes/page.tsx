import { redirect } from "next/navigation";

import { buildCardsView } from "../../../server/services/cards.ts";
import { currentUser } from "../../auth-context.ts";
import { Card, Empty } from "../../ui/primitives.tsx";
import { CardPanel } from "./card-panel.tsx";

export const dynamic = "force-dynamic";

export default async function Cartoes() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildCardsView(user.id);

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Cartões</h1>
        <p className="mt-1 text-[0.875rem] text-ink-muted">
          Fatura em aberto, atrasos, limite disponível e histórico de cada cartão.
        </p>
      </header>

      {view.cards.length ? (
        <div className="space-y-5">
          {view.cards.map((card) => (
            <CardPanel key={card.id} card={card} accounts={view.accounts} today={view.today} />
          ))}
        </div>
      ) : (
        <Card>
          <Empty
            title="Nenhum cartão cadastrado"
            hint="Cadastre um cartão para acompanhar competência, fatura e limite."
          />
        </Card>
      )}
    </main>
  );
}
