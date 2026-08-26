import { redirect } from "next/navigation";

import { buildCardsView } from "../../../server/services/cards.ts";
import { currentUser } from "../../auth-context.ts";
import { MetricStrip } from "../../ui/data-display.tsx";
import { money } from "../../ui/format.ts";
import { CreditCard, Percent, Wallet } from "../../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../../ui/page-frame.tsx";
import { Empty, Panel } from "../../ui/primitives.tsx";
import { CardsCarousel } from "./cards-carousel.tsx";

export const dynamic = "force-dynamic";

/**
 * Cartões e faturas.
 *
 * A tela existe para responder três coisas na ordem: quanto devo, quando fecha
 * e quanto ainda posso usar. Os totais no topo somam só cartões de crédito —
 * débito não tem fatura nem limite, e incluí-lo tornaria o número sem sentido.
 */
export default async function Cartoes() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const view = await buildCardsView(user.id);
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
        description="Fatura em aberto, atrasos, limite disponível e histórico de cada cartão."
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
                hint: "Tudo que já fechou e ainda não foi pago",
              },
            ]}
          />
        ) : null}

        {view.cards.length ? (
          <CardsCarousel cards={view.cards} accounts={view.accounts} today={view.today} />
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
