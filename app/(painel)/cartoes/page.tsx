import { buildCardsView } from "../../../server/services/cards.ts";
import { buildRewardsView } from "../../../server/services/rewards.ts";
import { currentUser } from "../../auth-context.ts";
import { MetricStrip } from "../../ui/data-display.tsx";
import { money } from "../../ui/format.ts";
import { CreditCard, Percent, Wallet } from "../../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../../ui/page-frame.tsx";
import { Empty, Panel } from "../../ui/primitives.tsx";
import { CardsCarousel } from "./cards-carousel.tsx";
import { NewCard } from "./new-card.tsx";

export const dynamic = "force-dynamic";

/**
 * Cartões e faturas.
 *
 * A tela existe para responder três coisas na ordem: quanto devo, quando fecha
 * e quanto ainda posso usar. Os totais no topo somam só cartões de crédito —
 * débito não tem fatura nem limite, e incluí-lo tornaria o número sem sentido.
 */
export default async function Cartoes({
  searchParams,
}: {
  searchParams: Promise<{ cartao?: string; aba?: string }>;
}) {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const [view, params] = await Promise.all([buildCardsView(user.id), searchParams]);
  const requestedCard = view.cards.find((card) => card.id === params.cartao);
  const rewardCard = view.cards.find((card) => card.kind === "credit" && card.rewardMode !== "none");
  const selectedCard = requestedCard ?? (params.aba === "recompensas" ? rewardCard : undefined) ?? view.cards[0];
  const rewardsActive = params.aba === "recompensas" && selectedCard?.kind === "credit" && selectedCard.rewardMode !== "none";
  const rewards = rewardsActive ? await buildRewardsView(user.id) : null;
  const credito = view.cards.filter((card) => card.kind === "credit");

  const limite = credito.reduce((soma, card) => soma + card.limitCents, 0);
  const usado = credito.reduce((soma, card) => soma + card.usedLimitCents, 0);
  const disponivel = credito.reduce((soma, card) => soma + card.availableLimitCents, 0);
  const emAberto = credito.reduce(
    (soma, card) =>
      soma + card.invoices.filter((invoice) => invoice.status !== "futura").reduce((total, invoice) => total + invoice.outstandingCents, 0),
    0,
  );
  const proporcao = limite > 0 ? (usado / limite) * 100 : 0;

  return (
    <Page>
      <PageHeader
        title="Cartões e faturas"
        description="Sua carteira de cartões, faturas e recompensas em um só lugar."
        actions={<NewCard accounts={view.accounts} />}
      />

      <Stack gap="lg">
        {credito.length ? (
          <MetricStrip
            metrics={[
              {
                label: "Limite total",
                value: money(limite),
                icon: CreditCard,
                hint: "Somado entre os cartões de crédito",
              },
              {
                label: "Comprometido",
                value: money(usado),
                tone: proporcao > 85 ? "negative" : proporcao > 60 ? "caution" : "neutral",
                icon: Percent,
                hint: `${Math.round(proporcao)}% do limite, incluindo parcelas futuras`,
              },
              {
                label: "Disponível",
                value: money(disponivel),
                tone: "positive",
                icon: Wallet,
                hint: "O que ainda dá para gastar no crédito",
              },
              {
                label: "Faturas em aberto",
                value: money(emAberto),
                tone: emAberto > 0 ? "caution" : "neutral",
                icon: CreditCard,
                hint: "Faturas atuais e anteriores ainda não pagas",
              },
            ]}
          />
        ) : null}

        {view.cards.length ? (
          <CardsCarousel
            cards={view.cards}
            accounts={view.accounts}
            today={view.today}
            selectedCardId={selectedCard.id}
            activeTab={rewardsActive ? "recompensas" : "faturas"}
            rewards={rewards?.cards.find((card) => card.cardId === selectedCard.id)}
          />
        ) : (
          <Panel>
            <Empty
              icon={CreditCard}
              title="Nenhum cartão cadastrado"
              hint="Cadastre um cartão para acompanhar competência, fatura e limite."
            />
          </Panel>
        )}
      </Stack>
    </Page>
  );
}
