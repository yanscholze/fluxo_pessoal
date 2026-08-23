import { redirect } from "next/navigation";

import { buildDashboard } from "../server/services/dashboard.ts";
import { currentUser } from "./auth-context.ts";
import { AccountsPanel } from "./ui/dashboard/accounts-panel.tsx";
import { CardsPanel } from "./ui/dashboard/cards-panel.tsx";
import { CashflowPanel } from "./ui/dashboard/cashflow-panel.tsx";
import { CategoryPanel } from "./ui/dashboard/category-panel.tsx";
import { FreeToSpend } from "./ui/dashboard/free-to-spend.tsx";
import { PositionStrip } from "./ui/dashboard/position-strip.tsx";
import { RecentPanel } from "./ui/dashboard/recent-panel.tsx";
import { UpcomingPanel } from "./ui/dashboard/upcoming-panel.tsx";
import { competenceLong } from "./ui/format.ts";

/** Depende da identidade da requisição: nunca pode ser servida de cache. */
export const dynamic = "force-dynamic";

function greeting(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function VisaoGeral() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const dashboard = await buildDashboard(user.id);
  const firstName = user.displayName.trim().split(/\s+/)[0];
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    ),
  );

  return (
    <main className="mx-auto w-full max-w-[76rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-8">
        <p className="text-label uppercase text-ink-subtle">{competenceLong(dashboard.competence)}</p>
        <h1 className="mt-1 text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">
          {greeting(hour)}, {firstName}
        </h1>
      </header>

      {/* A pergunta principal primeiro, sozinha, em tamanho que não deixa dúvida. */}
      <FreeToSpend data={dashboard.freeToSpend} today={dashboard.today} />

      <PositionStrip position={dashboard.position} monthFlow={dashboard.monthFlow} />

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <CardsPanel cards={dashboard.cards} today={dashboard.today} />
          <CashflowPanel points={dashboard.cashflow} />
          <RecentPanel transactions={dashboard.recentTransactions} />
        </div>

        <div className="space-y-5">
          <UpcomingPanel items={dashboard.upcoming} today={dashboard.today} />
          <CategoryPanel categories={dashboard.categorySpend} />
          <AccountsPanel accounts={dashboard.accounts} />
        </div>
      </div>
    </main>
  );
}
