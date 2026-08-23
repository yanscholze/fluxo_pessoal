/**
 * Faturas.
 *
 * Fatura aqui é entidade: tem competência, fechamento, vencimento e situação
 * própria. O que o usuário precisa saber num relance é quanto deve, quando
 * vence e quanto de limite sobrou.
 */

import type { Dashboard } from "../../../server/services/dashboard.ts";
import { Badge, Card, Empty, Meter, SectionHeading } from "../primitives.tsx";
import { date, money, relativeDay } from "../format.ts";

type CardSummary = Dashboard["cards"][number];

export function CardsPanel({ cards, today }: { cards: Dashboard["cards"]; today: Dashboard["today"] }) {
  const credito = cards.filter((card) => card.kind === "credit");

  return (
    <Card>
      <SectionHeading title="Faturas" hint="Fatura aberta, atrasos e limite disponível" />
      {credito.length ? (
        <div className="space-y-5">
          {credito.map((card) => (
            <CardRow key={card.id} card={card} today={today} />
          ))}
        </div>
      ) : (
        <Empty
          title="Nenhum cartão de crédito cadastrado"
          hint="Cadastre um cartão para acompanhar fatura, competência e limite."
        />
      )}
    </Card>
  );
}

function CardRow({ card, today }: { card: CardSummary; today: Dashboard["today"] }) {
  const fatura = card.currentInvoice;
  const atrasadas = card.overdueInvoices;
  const usado = card.limitCents - card.availableLimitCents;

  return (
    <article className="rounded-[--radius-control] border border-line bg-surface-sunken p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-6 w-6 rounded-md" style={{ backgroundColor: card.color }} aria-hidden />
          <h3 className="text-[0.875rem] font-semibold text-ink">{card.name}</h3>
          {card.last4 ? <span className="text-[0.75rem] text-ink-subtle">•••• {card.last4}</span> : null}
          {card.isPrimary ? <Badge tone="accent">principal</Badge> : null}
        </div>
        {atrasadas.length ? (
          <Badge tone="negative">
            {atrasadas.length} fatura{atrasadas.length > 1 ? "s" : ""} em atraso
          </Badge>
        ) : null}
      </header>

      {/* Fatura vencida e não paga é a dívida mais urgente do usuário: precisa
          aparecer com valor e data, não só como um contador. */}
      {atrasadas.length ? (
        <ul className="mt-3 space-y-1.5 rounded-[--radius-control] bg-negative-wash p-3">
          {atrasadas.map((invoice) => (
            <li key={invoice.competence} className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
              <span className="text-negative">
                Fatura {invoice.competence} venceu em {date(invoice.dueDate)}
              </span>
              <span className="tabular font-semibold text-negative">{money(invoice.outstandingCents)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {fatura ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <p className="text-label uppercase text-ink-subtle">Em aberto</p>
            <p className="tabular mt-0.5 text-figure-sm text-ink">{money(fatura.outstandingCents)}</p>
            <p className="mt-1 text-[0.75rem] text-ink-subtle">
              {fatura.paymentsCents > 0 ? `${money(fatura.paymentsCents)} já pagos de ${money(fatura.chargesCents)} · ` : ""}
              vence {date(fatura.dueDate)}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[0.75rem] sm:text-right">
            <dt className="text-ink-subtle">Fecha</dt>
            <dd className="text-ink">
              {date(fatura.closingDate)}
              <span className="ml-1 text-ink-subtle">({relativeDay(fatura.closingDate, today)})</span>
            </dd>
            <dt className="text-ink-subtle">Limite livre</dt>
            <dd className="tabular text-ink">{money(card.availableLimitCents)}</dd>
          </dl>
        </div>
      ) : null}

      {card.limitCents > 0 ? (
        <div className="mt-3">
          <Meter
            value={usado}
            total={card.limitCents}
            tone={usado / card.limitCents > 0.8 ? "negative" : "accent"}
            label={`Limite usado do ${card.name}`}
          />
          <p className="mt-1.5 text-[0.75rem] text-ink-subtle">
            {money(usado)} de {money(card.limitCents)} comprometidos, incluindo parcelas futuras
          </p>
        </div>
      ) : null}

      {card.upcomingInvoices.length ? (
        <p className="mt-3 text-[0.75rem] text-ink-subtle">
          Próximas:{" "}
          {card.upcomingInvoices
            .map((invoice) => `${invoice.competence} ${money(invoice.chargesCents)}`)
            .join(" · ")}
        </p>
      ) : null}
    </article>
  );
}
