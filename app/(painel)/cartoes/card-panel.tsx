"use client";

import { useState } from "react";

import type { CardsView, CardView, InvoiceView } from "../../../server/services/cards.ts";
import { Badge, Card, Meter } from "../../ui/primitives.tsx";
import { competenceShort, date, money, percent, relativeDay } from "../../ui/format.ts";
import { PayInvoice } from "./pay-invoice.tsx";

const ROTULO: Record<InvoiceView["status"], { texto: string; tom: "positive" | "negative" | "caution" | "neutral" }> = {
  paga: { texto: "Paga", tom: "positive" },
  em_aberto: { texto: "Em aberto", tom: "caution" },
  atrasada: { texto: "Atrasada", tom: "negative" },
  futura: { texto: "Futura", tom: "neutral" },
};

export function CardPanel({
  card,
  accounts,
  today,
}: {
  card: CardView;
  accounts: CardsView["accounts"];
  today: CardsView["today"];
}) {
  const [pagando, setPagando] = useState<InvoiceView | null>(null);

  const ativa = card.invoices.find((invoice) => invoice.isActive);
  const atrasadas = card.invoices.filter((invoice) => invoice.status === "atrasada");
  const usoDoLimite = card.limitCents > 0 ? card.usedLimitCents / card.limitCents : 0;

  return (
    <Card as="article">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-9 w-9 rounded-lg" style={{ backgroundColor: card.color }} aria-hidden />
          <div>
            <h2 className="flex items-center gap-2 text-[1rem] font-semibold text-ink">
              {card.name}
              {card.isPrimary ? <Badge tone="accent">principal</Badge> : null}
              {card.kind === "debit" ? <Badge>débito</Badge> : null}
            </h2>
            <p className="text-[0.75rem] text-ink-subtle">
              {card.brand ? `${card.brand} · ` : ""}
              {card.last4 ? `•••• ${card.last4} · ` : ""}
              paga por {card.paymentAccountName}
            </p>
          </div>
        </div>

        {card.kind === "credit" ? (
          <div className="text-right">
            <p className="text-label uppercase text-ink-subtle">Dívida total</p>
            <p className="tabular text-[1.25rem] font-semibold text-ink">{money(card.debtCents)}</p>
          </div>
        ) : null}
      </header>

      {card.kind === "credit" ? (
        <>
          {card.limitCents > 0 ? (
            <div className="mt-4">
              <Meter
                value={card.usedLimitCents}
                total={card.limitCents}
                tone={usoDoLimite > 0.8 ? "negative" : "accent"}
                label={`Limite usado do ${card.name}`}
              />
              <p className="mt-1.5 text-[0.75rem] text-ink-subtle">
                {money(card.availableLimitCents)} livres de {money(card.limitCents)} ·{" "}
                {percent(usoDoLimite * 100)} comprometido, incluindo parcelas futuras
              </p>
            </div>
          ) : null}

          {atrasadas.length ? (
            <ul className="mt-4 space-y-1.5 rounded-[--radius-control] bg-negative-wash p-3">
              {atrasadas.map((invoice) => (
                <li key={invoice.competence} className="flex items-center justify-between gap-3 text-[0.8125rem]">
                  <span className="text-negative">
                    Fatura de {competenceShort(invoice.competence)} venceu em {date(invoice.dueDate)}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular font-semibold text-negative">{money(invoice.outstandingCents)}</span>
                    <button
                      type="button"
                      onClick={() => setPagando(invoice)}
                      className="rounded-[--radius-control] bg-negative px-2 py-1 text-[0.75rem] font-semibold text-white"
                    >
                      Pagar
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {ativa ? (
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4 rounded-[--radius-control] border border-line bg-surface-sunken p-4">
              <div>
                <p className="text-label uppercase text-ink-subtle">
                  Fatura de {competenceShort(ativa.competence)}
                </p>
                <p className="tabular mt-1 text-figure-sm text-ink">{money(ativa.outstandingCents)}</p>
                <p className="mt-1 text-[0.75rem] text-ink-subtle">
                  {ativa.paymentsCents > 0
                    ? `${money(ativa.paymentsCents)} pagos de ${money(ativa.chargesCents)} · `
                    : ""}
                  fecha {date(ativa.closingDate)} ({relativeDay(ativa.closingDate, today)}) · vence{" "}
                  {date(ativa.dueDate)}
                </p>
              </div>
              {ativa.outstandingCents > 0 ? (
                <button
                  type="button"
                  onClick={() => setPagando(ativa)}
                  className="h-10 rounded-[--radius-control] bg-accent px-4 text-[0.875rem] font-semibold text-accent-ink"
                >
                  Pagar fatura
                </button>
              ) : null}
            </div>
          ) : null}

          <details className="mt-4">
            <summary className="cursor-pointer text-[0.8125rem] text-ink-muted">Histórico de faturas</summary>
            <ul className="mt-2 border-t border-line">
              {card.invoices.map((invoice) => {
                const rotulo = ROTULO[invoice.status];
                return (
                  <li
                    key={invoice.competence}
                    className="flex items-center justify-between gap-4 border-b border-line py-2 last:border-0"
                  >
                    <span className="flex items-center gap-2 text-[0.8125rem] text-ink">
                      {competenceShort(invoice.competence)}
                      <Badge tone={rotulo.tom}>{rotulo.texto}</Badge>
                    </span>
                    <span className="text-right">
                      <span className="tabular block text-[0.8125rem] text-ink">
                        {money(invoice.chargesCents)}
                      </span>
                      <span className="block text-[0.6875rem] text-ink-subtle">
                        vence {date(invoice.dueDate)}
                        {invoice.outstandingCents > 0 && invoice.status !== "futura"
                          ? ` · ${money(invoice.outstandingCents)} em aberto`
                          : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        </>
      ) : (
        <p className="mt-4 text-[0.8125rem] text-ink-muted">
          Cartão de débito: cada compra sai direto do saldo de {card.paymentAccountName}, sem fatura.
        </p>
      )}

      {pagando ? (
        <PayInvoice
          cardId={card.id}
          cardName={card.name}
          invoice={pagando}
          accounts={accounts}
          defaultAccountId={card.paymentAccountId}
          onClose={() => setPagando(null)}
        />
      ) : null}
    </Card>
  );
}
