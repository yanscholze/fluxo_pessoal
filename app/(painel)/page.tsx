import { buildDashboard } from "../../server/services/dashboard.ts";
import { currentUser } from "../auth-context.ts";
import { LinkButton } from "../ui/controls.tsx";
import { AccountsPanel } from "../ui/dashboard/accounts-panel.tsx";
import { CardsPanel } from "../ui/dashboard/cards-panel.tsx";
import { CashflowPanel } from "../ui/dashboard/cashflow-panel.tsx";
import { CategoryPanel } from "../ui/dashboard/category-panel.tsx";
import { FreeToSpend } from "../ui/dashboard/free-to-spend.tsx";
import { PositionStrip } from "../ui/dashboard/position-strip.tsx";
import { RecentPanel } from "../ui/dashboard/recent-panel.tsx";
import { UpcomingPanel } from "../ui/dashboard/upcoming-panel.tsx";
import { competenceLong } from "../ui/format.ts";
import { Plus } from "../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../ui/page-frame.tsx";

/** Depende da identidade da requisição: nunca pode ser servida de cache. */
export const dynamic = "force-dynamic";

function saudacao(hora: number): string {
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Painel.
 *
 * A ordem das seções é a ordem das perguntas: quanto sobra, qual a posição,
 * para onde o dinheiro vai, o que vence, o que já saiu. Cada faixa responde
 * uma coisa e recua para a próxima — é o que impede a tela de virar mural.
 */
export default async function VisaoGeral() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const dashboard = await buildDashboard(user.id);
  const primeiroNome = user.displayName.trim().split(/\s+/)[0];
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    ),
  );

  return (
    <Page>
      <PageHeader
        eyebrow={competenceLong(dashboard.competence)}
        title={`${saudacao(hora)}, ${primeiroNome}`}
        actions={
          <LinkButton href="/lancamentos" variant="primary" icon={Plus}>
            Novo lançamento
          </LinkButton>
        }
      />

      <Stack gap="lg">
        {/* A pergunta principal primeiro, sozinha, em tamanho que não deixa dúvida. */}
        <FreeToSpend data={dashboard.freeToSpend} today={dashboard.today} />

        <PositionStrip position={dashboard.position} monthFlow={dashboard.monthFlow} />

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CashflowPanel points={dashboard.cashflow} />
          </div>
          <CategoryPanel categories={dashboard.categorySpend} />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <CardsPanel cards={dashboard.cards} today={dashboard.today} />
          <UpcomingPanel items={dashboard.upcoming} today={dashboard.today} />
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <RecentPanel transactions={dashboard.recentTransactions} />
          </div>
          <AccountsPanel accounts={dashboard.accounts} />
        </div>
      </Stack>
    </Page>
  );
}
