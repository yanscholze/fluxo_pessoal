/**
 * Faturas.
 *
 * Fatura aqui é entidade: tem competência, fechamento, vencimento e situação
 * própria. O que o usuário precisa saber num relance é quanto deve, quando
 * fecha, quando vence e quanto de limite sobrou.
 *
 * As próximas competências aparecem como fichas, e não como texto corrido:
 * é o que torna visível que uma compra feita hoje pode cair na fatura do mês
 * que vem — a regra que mais gera surpresa no cartão de crédito.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { date, money, relativeDay } from "../format.ts";
import { CircleAlert, CreditCard } from "../icons.tsx";
import { Badge, Empty, Meter, Panel, PanelHeader } from "../primitives.tsx";

type CardSummary = Dashboard["cards"][number];

export function CardsPanel({ cards, today }: { cards: Dashboard["cards"]; today: Dashboard["today"] }) {
  const credito = cards.filter((card) => card.kind === "credit");

  return (
    <Panel>
      <PanelHeader
        title="Faturas"
        icon={CreditCard}
        hint="Fatura aberta, atrasos e limite disponível"
        action={
          <a href="/cartoes" className="text-body-sm font-medium text-accent hover:underline">
            Ver cartões
          </a>
        }
      />

      {credito.length ? (
        <div className="space-y-3">
          {credito.map((card) => (
            <CartaoAberto key={card.id} card={card} today={today} />
          ))}
        </div>
      ) : (
        <Empty
          icon={CreditCard}
          title="Nenhum cartão de crédito cadastrado"
          hint="Cadastre um cartão para acompanhar fatura, competência e limite."
          compact
        />
      )}
    </Panel>
  );
}

function CartaoAberto({ card, today }: { card: CardSummary; today: Dashboard["today"] }) {
  const fatura = card.currentInvoice;
  const atrasadas = card.overdueInvoices;
  const usado = card.limitCents - card.availableLimitCents;
  const proporcao = card.limitCents > 0 ? usado / card.limitCents : 0;

  return (
    <article className="rounded-md border border-line bg-surface-sunken p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="size-7 shrink-0 rounded-md ring-1 ring-inset ring-black/10"
            style={{ backgroundColor: card.color }}
            aria-hidden
          />
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-body font-medium text-ink">
              <span className="truncate">{card.name}</span>
              {card.isPrimary ? <Badge tone="accent">principal</Badge> : null}
            </h3>
            {card.last4 ? <p className="tabular text-caption text-ink-subtle">•••• {card.last4}</p> : null}
          </div>
        </div>

        {atrasadas.length ? (
          <Badge tone="negative" icon={CircleAlert}>
            {atrasadas.length} em atraso
          </Badge>
        ) : null}
      </header>

      {/* Fatura vencida e não paga é a dívida mais urgente do usuário: precisa
          aparecer com valor e data, não só como um contador. */}
      {atrasadas.length ? (
        <ul className="mt-3 space-y-1 rounded-sm bg-negative-wash px-3 py-2">
          {atrasadas.map((invoice) => (
            <li key={invoice.competence} className="flex items-baseline justify-between gap-3 text-caption">
              <span className="text-negative">
                Fatura {invoice.competence} venceu em {date(invoice.dueDate)}
              </span>
              <span className="tabular font-semibold text-negative">{money(invoice.outstandingCents)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {fatura ? (
        <div className="mt-3.5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="text-label uppercase text-ink-subtle">Em aberto</p>
            <p className="tabular mt-0.5 text-figure-sm text-ink">{money(fatura.outstandingCents)}</p>
            {fatura.paymentsCents > 0 ? (
              <p className="mt-0.5 text-caption text-ink-subtle">
                {money(fatura.paymentsCents)} pagos de {money(fatura.chargesCents)}
              </p>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-caption">
            <dt className="text-ink-subtle">Fecha</dt>
            <dd className="text-right text-ink">
              {date(fatura.closingDate)}
              <span className="ml-1 text-ink-subtle">({relativeDay(fatura.closingDate, today)})</span>
            </dd>
            <dt className="text-ink-subtle">Vence</dt>
            <dd className="text-right text-ink">{date(fatura.dueDate)}</dd>
          </dl>
        </div>
      ) : null}

      {card.limitCents > 0 ? (
        <div className="mt-3.5">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-caption">
            <span className="text-ink-subtle">Limite comprometido, com parcelas futuras</span>
            <span className="tabular text-ink">
              {money(usado)} <span className="text-ink-subtle">de {money(card.limitCents)}</span>
            </span>
          </div>
          <Meter
            value={usado}
            total={card.limitCents}
            tone={proporcao > 0.85 ? "negative" : proporcao > 0.6 ? "caution" : "accent"}
            label={`Limite usado do ${card.name}`}
          />
        </div>
      ) : null}

      {card.upcomingInvoices.length ? (
        <ul className="mt-3.5 flex flex-wrap gap-1.5">
          {card.upcomingInvoices.map((invoice) => (
            <li
              key={invoice.competence}
              className="rounded-sm border border-line bg-surface px-2 py-1 text-caption text-ink-muted"
            >
              {invoice.competence}
              <span className="tabular ml-1.5 font-medium text-ink">{money(invoice.chargesCents)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
