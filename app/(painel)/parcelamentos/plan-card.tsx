"use client";

/**
 * Um parcelamento, com o cronograma sob demanda.
 *
 * O cabeçalho responde "quanto falta e quando termina"; as parcelas ficam
 * escondidas até serem pedidas. Mostrar quarenta e oito linhas de cara enterra
 * a resposta no detalhe.
 */

import { useState } from "react";

import type { PlanView } from "../../../server/services/installments.ts";
import { Badge, Card, Meter } from "../../ui/primitives.tsx";
import { competenceShort, date, money, percent } from "../../ui/format.ts";
import { AnticipationPanel } from "./anticipation-panel.tsx";

const ROTULO_STATUS = {
  paid: { texto: "Paga", tom: "positive" as const },
  overdue: { texto: "Atrasada", tom: "negative" as const },
  open: { texto: "Em aberto", tom: "neutral" as const },
};

export function PlanCard({ plan }: { plan: PlanView }) {
  const [aberto, setAberto] = useState(false);
  const [simulando, setSimulando] = useState(false);

  return (
    <Card as="article">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[0.9375rem] font-semibold text-ink">{plan.label}</h3>
          <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
            {plan.cardName} · {plan.paidCount}/{plan.totalCount} parcelas · compra em {date(plan.purchaseDate)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-[1.125rem] font-semibold text-ink">{money(plan.openAmount)}</p>
          <p className="text-[0.75rem] text-ink-subtle">
            {plan.isSettled ? "quitado" : `de ${money(plan.totalAmount)}`}
          </p>
        </div>
      </header>

      <div className="mt-3">
        <Meter
          value={plan.paidAmount}
          total={plan.totalAmount}
          tone={plan.overdueCount > 0 ? "negative" : "accent"}
          label={`Progresso de ${plan.label}`}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-ink-subtle">
          <span>{percent(plan.percentPaid)} pago</span>
          {plan.nextDueDate ? <span>próxima em {date(plan.nextDueDate)}</span> : null}
          {plan.lastCompetence ? <span>termina em {competenceShort(plan.lastCompetence)}</span> : null}
          {plan.overdueCount > 0 ? (
            <Badge tone="negative">
              {plan.overdueCount} parcela{plan.overdueCount > 1 ? "s" : ""} em atraso
            </Badge>
          ) : null}
          {plan.monthlyInterestBasisPoints > 0 ? (
            <Badge tone="caution">{percent(plan.monthlyInterestBasisPoints / 100, 2)} ao mês</Badge>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setAberto((valor) => !valor)}
          className="rounded-[--radius-control] border border-line px-3 py-1.5 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken"
        >
          {aberto ? "Ocultar parcelas" : "Ver parcelas"}
        </button>
        {!plan.isSettled ? (
          <button
            type="button"
            onClick={() => setSimulando((valor) => !valor)}
            className="rounded-[--radius-control] border border-line px-3 py-1.5 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken"
          >
            {simulando ? "Fechar simulação" : "Simular antecipação"}
          </button>
        ) : null}
      </div>

      {simulando ? <AnticipationPanel planId={plan.planId} /> : null}

      {aberto ? (
        <ol className="mt-4 border-t border-line">
          {plan.entries.map((entry) => {
            const rotulo = ROTULO_STATUS[entry.status];
            return (
              <li
                key={entry.number}
                className="flex items-center justify-between gap-4 border-b border-line py-2 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="tabular w-10 text-[0.75rem] text-ink-subtle">
                    {entry.number}/{plan.totalCount}
                  </span>
                  <span className="text-[0.8125rem] text-ink">{competenceShort(entry.competence)}</span>
                  <Badge tone={rotulo.tom}>{rotulo.texto}</Badge>
                </div>
                <div className="text-right">
                  <p className="tabular text-[0.8125rem] text-ink">{money(entry.amountCents)}</p>
                  <p className="text-[0.6875rem] text-ink-subtle">vence {date(entry.dueDate)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </Card>
  );
}
