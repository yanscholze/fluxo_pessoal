import Link from "next/link";

import type { CardsView, CardView } from "../../../server/services/cards.ts";
import type { CardRewardsView } from "../../../server/services/rewards.ts";
import { CreditCard, Gift } from "../../ui/icons.tsx";
import { join } from "../../ui/primitives.tsx";
import { CardFace, type FaceData } from "./card-face.tsx";
import { CardPanel } from "./card-panel.tsx";
import { CardRewardsPanel } from "./card-rewards-panel.tsx";

function paraFace(card: CardView): FaceData {
  const ativa = card.invoices.find((invoice) => invoice.isActive);
  return {
    name: card.name,
    brand: card.brand,
    last4: card.last4,
    color: card.color,
    imageUrl: card.imageUrl,
    kind: card.kind,
    isPrimary: card.isPrimary,
    closingOn: ativa?.closingDate ?? null,
    dueOn: ativa?.dueDate ?? null,
    invoice:
      card.kind === "credit" && ativa
        ? { competence: ativa.competence, outstandingCents: ativa.outstandingCents }
        : null,
    overdueCount: card.invoices.filter((invoice) => invoice.status === "atrasada").length,
  };
}

/** A URL identifica o cartão e a seção: recarregar ou compartilhar mantém a escolha. */
export function CardsCarousel({
  cards,
  accounts,
  today,
  selectedCardId,
  activeTab,
  rewards,
  hideFaces,
}: {
  cards: readonly CardView[];
  accounts: CardsView["accounts"];
  today: CardsView["today"];
  selectedCardId: string;
  activeTab: "faturas" | "recompensas";
  rewards?: CardRewardsView;
  /**
   * Esconde a fileira de faces.
   *
   * Na tela de Cartões o cartão já aparece grande no alto, no desenho do Mesa,
   * e as setas ao lado dele trocam a seleção. Repetir a fileira de miniaturas
   * aqui embaixo seria mostrar a mesma escolha duas vezes.
   */
  hideFaces?: boolean;
}) {
  const selecionado = cards.find((card) => card.id === selectedCardId) ?? cards[0];
  const temRecompensas = selecionado?.kind === "credit" && selecionado.rewardMode !== "none";

  function cardUrl(card: CardView, tab = activeTab) {
    const hasRewards = card.kind === "credit" && card.rewardMode !== "none";
    const query = new URLSearchParams({ cartao: card.id });
    if (tab === "recompensas" && hasRewards) query.set("aba", "recompensas");
    return `/cartoes?${query.toString()}`;
  }

  return (
    <div className="space-y-5">
      {hideFaces ? null : <nav aria-label="Seus cartões" className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 pt-1 sm:mx-0 sm:px-0">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={cardUrl(card)}
            scroll={false}
            aria-label={`Ver ${card.name}`}
            aria-current={card.id === selecionado?.id ? "page" : undefined}
            className="block shrink-0 snap-start rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            <CardFace data={paraFace(card)} selected={cards.length > 1 ? card.id === selecionado?.id : undefined} />
          </Link>
        ))}
      </nav>}

      {selecionado && temRecompensas ? (
        <nav aria-label={`Seções do ${selecionado.name}`} className="flex gap-2 border-b border-line">
          {([
            { id: "faturas", label: "Faturas e limite", icon: CreditCard },
            { id: "recompensas", label: "Recompensas", icon: Gift },
          ] as const).map((tab) => (
            <Link
              key={tab.id}
              href={cardUrl(selecionado, tab.id)}
              scroll={false}
              aria-current={activeTab === tab.id ? "page" : undefined}
              className={join(
                "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 text-body-sm font-medium transition-colors",
                activeTab === tab.id ? "border-accent text-accent" : "border-transparent text-ink-muted hover:border-line-strong hover:text-ink",
              )}
            >
              <tab.icon size={16} aria-hidden />
              {tab.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {selecionado ? (
        activeTab === "recompensas" && rewards ? (
          <CardRewardsPanel card={rewards} accounts={accounts} />
        ) : (
          <CardPanel key={selecionado.id} card={selecionado} accounts={accounts} today={today} />
        )
      ) : null}
    </div>
  );
}
