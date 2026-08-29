"use client";

import { useState } from "react";

import type { CardsView, CardView, InvoiceView } from "../../../server/services/cards.ts";
import { Button } from "../../ui/controls.tsx";
import { DataTable, Td, Tr } from "../../ui/data-display.tsx";
import { competenceShort, date, money, percent, relativeDay } from "../../ui/format.ts";
import { CircleAlert, CreditCard } from "../../ui/icons.tsx";
import { Badge, Divider, Meter, Panel, type Tone } from "../../ui/primitives.tsx";
import { PayInvoice } from "./pay-invoice.tsx";

const SITUACAO: Record<InvoiceView["status"], { texto: string; tom: Tone }> = {
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
  const [historicoAberto, setHistoricoAberto] = useState(false);

  const ativa = card.invoices.find((invoice) => invoice.isActive);
  const atrasadas = card.invoices.filter((invoice) => invoice.status === "atrasada");
  const usoDoLimite = card.limitCents > 0 ? card.usedLimitCents / card.limitCents : 0;

  // As competências ao redor da ativa. É esta sequência que torna visível a
  // regra que mais gera surpresa no crédito: uma compra feita depois do
  // fechamento não cai na fatura atual, cai na seguinte.
  const indiceAtivo = card.invoices.findIndex((invoice) => invoice.isActive);
  const sequencia =
    indiceAtivo >= 0 ? card.invoices.slice(indiceAtivo, indiceAtivo + 4) : card.invoices.slice(0, 4);

  return (
    <Panel as="article">
      {/* Nome, bandeira, final e situação vivem na face do cartão, logo acima.
          Repeti-los aqui seria a mesma informação duas vezes na mesma dobra. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-heading text-ink">
            {card.kind === "credit" ? "Fatura e limite" : "Uso do cartão"}
          </h2>
          <p className="mt-0.5 truncate text-caption text-ink-subtle">
            {card.brand ? `${card.brand} · ` : ""}paga por {card.paymentAccountName}
          </p>
        </div>

        {card.kind === "credit" ? (
          <div className="text-right">
            <p className="text-label uppercase text-ink-subtle">Dívida total</p>
            <p className="tabular mt-0.5 text-figure-sm text-ink">{money(card.debtCents)}</p>
          </div>
        ) : null}
      </header>

      {card.kind !== "credit" ? (
        <p className="mt-4 text-body-sm text-ink-muted">
          Cartão de débito: cada compra sai direto do saldo de {card.paymentAccountName}, sem fatura.
        </p>
      ) : (
        <>
          {atrasadas.length ? (
            <ul className="mt-4 space-y-1.5 rounded-md bg-negative-wash p-3">
              {atrasadas.map((invoice) => (
                <li key={invoice.competence} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-body-sm text-negative">
                    <CircleAlert size={14} strokeWidth={1.5} aria-hidden />
                    Fatura de {competenceShort(invoice.competence)} venceu em {date(invoice.dueDate)}
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="tabular text-body-sm font-semibold text-negative">
                      {money(invoice.outstandingCents)}
                    </span>
                    <Button variant="danger" size="sm" onClick={() => setPagando(invoice)}>
                      Pagar
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {ativa ? (
            <div className="mt-4 rounded-md border border-line bg-surface-sunken p-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-label uppercase text-ink-subtle">
                    Fatura de {competenceShort(ativa.competence)}
                  </p>
                  <p className="tabular mt-1 text-figure text-ink">{money(ativa.outstandingCents)}</p>
                  {ativa.paymentsCents > 0 ? (
                    <p className="mt-1 text-caption text-ink-subtle">
                      {money(ativa.paymentsCents)} pagos de {money(ativa.chargesCents)}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-end gap-5">
                  <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-caption">
                    <dt className="text-ink-subtle">Fecha</dt>
                    <dd className="text-right text-ink">
                      {date(ativa.closingDate)}
                      <span className="ml-1 text-ink-subtle">({relativeDay(ativa.closingDate, today)})</span>
                    </dd>
                    <dt className="text-ink-subtle">Vence</dt>
                    <dd className="text-right text-ink">
                      {date(ativa.dueDate)}
                      <span className="ml-1 text-ink-subtle">({relativeDay(ativa.dueDate, today)})</span>
                    </dd>
                  </dl>

                  {ativa.outstandingCents > 0 ? (
                    <Button variant="primary" onClick={() => setPagando(ativa)}>
                      Pagar fatura
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {sequencia.length > 1 ? (
            <div className="mt-4">
              <p className="mb-2 text-label uppercase text-ink-subtle">Próximas competências</p>
              <ol className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
                {sequencia.map((invoice) => {
                  const situacao = SITUACAO[invoice.status];
                  return (
                    <li key={invoice.competence} className="bg-surface p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-caption text-ink-muted">
                          {competenceShort(invoice.competence)}
                        </span>
                        {invoice.isActive ? <Badge tone="accent">atual</Badge> : null}
                      </div>
                      <p className="tabular mt-1 text-body font-medium text-ink">
                        {money(invoice.chargesCents)}
                      </p>
                      <p className="mt-0.5 text-caption text-ink-subtle">
                        {situacao.texto.toLowerCase()} · vence {date(invoice.dueDate)}
                      </p>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-2 text-caption text-ink-subtle">
                Compra feita depois do fechamento entra na competência seguinte, não na atual.
              </p>
            </div>
          ) : null}

          {card.limitCents > 0 ? (
            <div className="mt-4">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-caption">
                <span className="text-ink-subtle">Limite comprometido, incluindo parcelas futuras</span>
                <span className="tabular text-ink">
                  {money(card.usedLimitCents)}{" "}
                  <span className="text-ink-subtle">de {money(card.limitCents)}</span>
                </span>
              </div>
              <Meter
                value={card.usedLimitCents}
                total={card.limitCents}
                tone={usoDoLimite > 0.85 ? "negative" : usoDoLimite > 0.6 ? "caution" : "accent"}
                label={`Limite usado do ${card.name}`}
              />
              <p className="mt-1.5 text-caption text-ink-subtle">
                {money(card.availableLimitCents)} livres · {percent(usoDoLimite * 100)} comprometido
              </p>
            </div>
          ) : null}

          <div className="mt-4">
            <Divider soft />
            <button
              type="button"
              onClick={() => setHistoricoAberto((aberto) => !aberto)}
              aria-expanded={historicoAberto}
              className="mt-3 text-body-sm font-medium text-accent transition-colors hover:underline"
            >
              {historicoAberto ? "Ocultar histórico de faturas" : "Ver histórico de faturas"}
            </button>

            {historicoAberto ? (
              <div className="mt-3">
                <DataTable
                  caption={`Histórico de faturas do ${card.name}`}
                  columns={[
                    { key: "competencia", header: "Competência" },
                    { key: "situacao", header: "Situação", hideBelow: "sm" },
                    { key: "vencimento", header: "Vence", align: "right", hideBelow: "sm" },
                    { key: "total", header: "Total", align: "right" },
                    { key: "aberto", header: "Em aberto", align: "right" },
                  ]}
                >
                  {card.invoices.map((invoice) => {
                    const situacao = SITUACAO[invoice.status];
                    return (
                      <Tr key={invoice.competence}>
                        <Td className="text-body-sm">{competenceShort(invoice.competence)}</Td>
                        <Td hideBelow="sm">
                          <Badge tone={situacao.tom}>{situacao.texto}</Badge>
                        </Td>
                        <Td align="right" hideBelow="sm" className="tabular text-caption text-ink-subtle">
                          {date(invoice.dueDate)}
                        </Td>
                        <Td align="right" className="tabular text-body-sm text-ink">
                          {money(invoice.chargesCents)}
                        </Td>
                        <Td align="right">
                          <span
                            className={`tabular text-body-sm ${
                              invoice.outstandingCents > 0 && invoice.status !== "futura"
                                ? "font-medium text-caution"
                                : "text-ink-subtle"
                            }`}
                          >
                            {invoice.outstandingCents > 0 ? money(invoice.outstandingCents) : "—"}
                          </span>
                        </Td>
                      </Tr>
                    );
                  })}
                </DataTable>
              </div>
            ) : null}
          </div>
        </>
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
    </Panel>
  );
}
