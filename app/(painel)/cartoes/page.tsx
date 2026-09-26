import Link from "next/link";

import { buildCardsView } from "../../../server/services/cards.ts";
import { buildRewardsView } from "../../../server/services/rewards.ts";
import { buildSubscriptionsReport } from "../../../server/services/subscriptions.ts";
import { currentUser } from "../../auth-context.ts";
import { dateShort, money } from "../../ui/format.ts";
import { ChevronLeft, ChevronRight, CreditCard, Zap } from "../../ui/icons.tsx";
import { Donut, MetricTile, PanelHeading } from "../../ui/mesa.tsx";
import { Empty, join } from "../../ui/primitives.tsx";
import { CardsCarousel } from "./cards-carousel.tsx";
import { MesaCardFace } from "./mesa-card-face.tsx";
import { NewCard } from "./new-card.tsx";

export const dynamic = "force-dynamic";

/**
 * Cartões e faturas, no desenho do Mesa.
 *
 * O cartão ocupa o alto, sozinho e centralizado, com as setas para trocar de
 * cartão ao lado. Abaixo, três respostas na ordem em que se pergunta: quanto
 * devo, quanto do limite já foi, e quanto disso é recorrente.
 *
 * A troca de cartão continua indo pela URL (`?cartao=`), e não por estado de
 * componente: recarregar ou compartilhar o endereço mantém o cartão escolhido,
 * e a tela continua podendo ser renderizada no servidor.
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

  const [view, params, assinaturas] = await Promise.all([
    buildCardsView(user.id),
    searchParams,
    buildSubscriptionsReport(user.id),
  ]);

  if (!view.cards.length) {
    return (
      <div className="content-area">
        <section className="glass-panel p-6">
          <Empty
            icon={CreditCard}
            title="Nenhum cartão cadastrado"
            hint="Cadastre um cartão para acompanhar competência, fatura e limite."
          />
          <div className="mt-4">
            <NewCard accounts={view.accounts} />
          </div>
        </section>
      </div>
    );
  }

  const requestedCard = view.cards.find((card) => card.id === params.cartao);
  const rewardCard = view.cards.find((card) => card.kind === "credit" && card.rewardMode !== "none");
  const selecionado =
    requestedCard ?? (params.aba === "recompensas" ? rewardCard : undefined) ?? view.cards[0];
  const rewardsActive =
    params.aba === "recompensas" && selecionado.kind === "credit" && selecionado.rewardMode !== "none";
  const rewards = rewardsActive ? await buildRewardsView(user.id) : null;

  const indice = view.cards.findIndex((card) => card.id === selecionado.id);
  const anterior = view.cards[(indice - 1 + view.cards.length) % view.cards.length];
  const proximo = view.cards[(indice + 1) % view.cards.length];

  const fatura = selecionado.invoices.find((invoice) => invoice.isActive) ?? null;
  const proporcao =
    selecionado.limitCents > 0 ? (selecionado.usedLimitCents / selecionado.limitCents) * 100 : 0;

  const recorrentes = assinaturas.subscriptions.filter(
    (assinatura) => assinatura.cardId === selecionado.id && assinatura.isActive,
  );
  const mensalRecorrente =
    assinaturas.byCard.find((linha) => linha.cardId === selecionado.id)?.monthlyCents ?? 0;

  return (
    <div className="content-area">
      {/* ------------------------------------------------------------------ */}
      {/* O cartão, sozinho no alto.                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative mx-auto mb-10 max-w-md">
        <MesaCardFace
          nome={selecionado.name}
          last4={selecionado.last4}
          titular={user.displayName}
          fechaEm={fatura?.closingDate ?? null}
          cor={selecionado.color}
        />

        {view.cards.length > 1 ? (
          <>
            <SetaDeCartao href={`/cartoes?cartao=${anterior.id}`} lado="esquerda" rotulo={anterior.name} />
            <SetaDeCartao href={`/cartoes?cartao=${proximo.id}`} lado="direita" rotulo={proximo.name} />
          </>
        ) : null}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Fatura, limite e recorrências.                                      */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid gap-5 md:grid-cols-3">
        <MetricTile
          tom="accent"
          icone={<CreditCard className="size-4" aria-hidden />}
          rotulo="Fatura atual"
          valor={fatura ? money(fatura.outstandingCents) : "—"}
          apoio={
            fatura
              ? `Fecha em ${dateShort(fatura.closingDate)} · vence em ${dateShort(fatura.dueDate)}`
              : "Sem fatura aberta neste cartão"
          }
        />

        <section className="glass-panel p-6">
          <PanelHeading titulo="Limite utilizado" />
          {selecionado.limitCents > 0 ? (
            <>
              <Donut percent={proporcao} />
              <p className="mt-5 text-center text-caption text-ink-subtle">
                {money(selecionado.availableLimitCents)} ainda disponível de{" "}
                {money(selecionado.limitCents)}
              </p>
            </>
          ) : (
            <p className="text-body-sm text-ink-subtle">Este cartão não tem limite cadastrado.</p>
          )}
        </section>

        <MetricTile
          tom="caution"
          icone={<Zap className="size-4" aria-hidden />}
          rotulo="Recorrências"
          valor={money(mensalRecorrente)}
          apoio={
            recorrentes.length === 1
              ? "1 assinatura neste cartão"
              : `${recorrentes.length} assinaturas neste cartão`
          }
        />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Faturas, lançamentos e recompensas do cartão escolhido.             */}
      {/* ------------------------------------------------------------------ */}
      <section className="glass-panel mt-5 p-6">
        <PanelHeading
          titulo="Lançamentos do cartão"
          apoio={`${selecionado.name} · ${selecionado.brand}`}
          acao={<NewCard accounts={view.accounts} />}
        />
        <CardsCarousel
          cards={view.cards}
          accounts={view.accounts}
          today={view.today}
          selectedCardId={selecionado.id}
          activeTab={rewardsActive ? "recompensas" : "faturas"}
          rewards={rewards?.cards.find((card) => card.cardId === selecionado.id)}
          hideFaces
        />
      </section>
    </div>
  );
}

/**
 * A seta que troca de cartão.
 *
 * Fica sobre a face, colada na borda, como no desenho. É um `Link` e não um
 * botão porque a escolha vive na URL — o que permite voltar no histórico e
 * compartilhar a tela já no cartão certo.
 */
function SetaDeCartao({
  href,
  lado,
  rotulo,
}: {
  href: string;
  lado: "esquerda" | "direita";
  rotulo: string;
}) {
  const Icone = lado === "esquerda" ? ChevronLeft : ChevronRight;

  return (
    <Link
      href={href}
      aria-label={`Ver ${rotulo}`}
      className={join(
        "absolute top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-raised hover:text-ink",
        lado === "esquerda" ? "-left-12" : "-right-12",
      )}
    >
      <Icone className="size-4" aria-hidden />
    </Link>
  );
}
