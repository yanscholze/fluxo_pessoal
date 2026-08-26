"use client";

/**
 * Carrossel de cartões.
 *
 * Arrastar para o lado troca o cartão, e o detalhe abaixo acompanha. O
 * movimento é `scroll-snap` nativo — não é gesto simulado em JavaScript: o
 * arrasto no celular, a rolagem horizontal do trackpad, a barra de rolagem e o
 * teclado passam a funcionar de graça, e nenhum deles funcionaria numa
 * implementação com `pointerdown`/`pointermove`.
 *
 * O JavaScript entra só para responder "qual cartão está no centro agora", via
 * `IntersectionObserver`. Se ele falhar, o carrossel continua rolando e os
 * cartões continuam clicáveis — degrada para uma lista horizontal, não para
 * uma tela quebrada.
 */

import { useEffect, useRef, useState } from "react";

import type { CardsView, CardView } from "../../../server/services/cards.ts";
import { join } from "../../ui/primitives.tsx";
import { CardFace, type FaceData } from "./card-face.tsx";
import { CardPanel } from "./card-panel.tsx";

function paraFace(card: CardView): FaceData {
  const ativa = card.invoices.find((invoice) => invoice.isActive);
  return {
    name: card.name,
    brand: card.brand,
    last4: card.last4,
    color: card.color,
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

export function CardsCarousel({
  cards,
  accounts,
  today,
}: {
  cards: readonly CardView[];
  accounts: CardsView["accounts"];
  today: CardsView["today"];
}) {
  const [ativo, setAtivo] = useState(0);
  const trilho = useRef<HTMLDivElement>(null);

  // Quem manda no cartão ativo é a posição da rolagem, e não o clique: assim o
  // arrasto e o clique não brigam por dois estados diferentes de verdade.
  //
  // A escolha é pelo cartão mais próximo da borda esquerda do trilho, e não
  // pelo que estiver visível. `IntersectionObserver` parecia natural aqui e
  // estava errado: numa tela larga todos os cartões ficam visíveis ao mesmo
  // tempo, e o último a disparar vencia — o detalhe abria num cartão que o
  // usuário nunca escolheu.
  useEffect(() => {
    const elemento = trilho.current;
    if (!elemento) return;

    function recalcular() {
      const trilhoCaixa = elemento!.getBoundingClientRect();
      let melhor = 0;
      let menorDistancia = Number.POSITIVE_INFINITY;

      for (const filho of elemento!.querySelectorAll<HTMLElement>("[data-indice]")) {
        const distancia = Math.abs(filho.getBoundingClientRect().left - trilhoCaixa.left);
        if (distancia < menorDistancia) {
          menorDistancia = distancia;
          melhor = Number(filho.dataset.indice);
        }
      }

      setAtivo((atual) => (atual === melhor ? atual : melhor));
    }

    recalcular();
    elemento.addEventListener("scroll", recalcular, { passive: true });
    return () => elemento.removeEventListener("scroll", recalcular);
  }, [cards.length]);

  function irPara(indice: number) {
    const elemento = trilho.current;
    const alvo = elemento?.querySelector<HTMLElement>(`[data-indice="${indice}"]`);
    alvo?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
    setAtivo(indice);
  }

  const selecionado = cards[Math.min(ativo, cards.length - 1)];

  return (
    <div>
      <div
        ref={trilho}
        // `overflow-x-auto` com snap dá o arrasto; o padding lateral existe para
        // o primeiro e o último cartão poderem centralizar.
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 pt-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="Seus cartões"
      >
        {cards.map((card, indice) => (
          <div key={card.id} data-indice={indice} className="snap-start">
            <CardFace
              data={paraFace(card)}
              selected={cards.length > 1 ? indice === ativo : undefined}
              onSelect={() => irPara(indice)}
            />
          </div>
        ))}
      </div>

      {cards.length > 1 ? (
        <div className="mb-5 flex items-center justify-center gap-1.5">
          {cards.map((card, indice) => (
            <button
              key={card.id}
              type="button"
              onClick={() => irPara(indice)}
              aria-label={`Ir para ${card.name}`}
              aria-current={indice === ativo ? "true" : undefined}
              className={join(
                "h-1.5 rounded-full transition-all duration-300 ease-out-soft",
                indice === ativo ? "w-5 bg-accent" : "w-1.5 bg-line-strong hover:bg-ink-subtle",
              )}
            />
          ))}
        </div>
      ) : (
        <div className="mb-5" />
      )}

      {selecionado ? (
        <CardPanel key={selecionado.id} card={selecionado} accounts={accounts} today={today} />
      ) : null}
    </div>
  );
}
