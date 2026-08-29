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
import { Button } from "../../ui/controls.tsx";
import { DataTable, Td, Tr } from "../../ui/data-display.tsx";
import { competenceShort, date, money, percent } from "../../ui/format.ts";
import { CalendarClock, Percent, Zap } from "../../ui/icons.tsx";
import { Badge, Meter, Panel, type Tone } from "../../ui/primitives.tsx";
import { AnticipationPanel } from "./anticipation-panel.tsx";

const SITUACAO: Record<string, { texto: string; tom: Tone }> = {
  paid: { texto: "Paga", tom: "positive" },
  overdue: { texto: "Atrasada", tom: "negative" },
  open: { texto: "Em aberto", tom: "neutral" },
};

export function PlanCard({ plan }: { plan: PlanView }) {
  const [aberto, setAberto] = useState(false);
  const [simulando, setSimulando] = useState(false);

  return (
    <Panel as="article">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-heading text-ink">{plan.label}</h3>
          <p className="mt-0.5 text-caption text-ink-muted">
            {plan.cardName} · compra em {date(plan.purchaseDate)}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="tabular text-figure-sm text-ink">{money(plan.openAmount)}</p>
          <p className="text-caption text-ink-subtle">
            {plan.isSettled ? "quitado" : `restam de ${money(plan.totalAmount)}`}
          </p>
        </div>
      </header>

      <div className="mt-4">
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-caption">
          <span className="tabular text-ink">
            {plan.paidCount}
            <span className="text-ink-subtle">/{plan.totalCount} parcelas</span>
          </span>
          <span className="tabular text-ink-subtle">{percent(plan.percentPaid)} pago</span>
        </div>
        <Meter
          value={plan.paidAmount}
          total={plan.totalAmount}
          tone={plan.overdueCount > 0 ? "negative" : "accent"}
          label={`Progresso de ${plan.label}`}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-ink-subtle">
        {plan.nextDueDate ? (
          <span className="flex items-center gap-1.5">
            <CalendarClock size={13} strokeWidth={1.5} aria-hidden />
            próxima em {date(plan.nextDueDate)}
          </span>
        ) : null}
        {plan.lastCompetence ? <span>termina em {competenceShort(plan.lastCompetence)}</span> : null}
        {plan.overdueCount > 0 ? (
          <Badge tone="negative">
            {plan.overdueCount} parcela{plan.overdueCount > 1 ? "s" : ""} em atraso
          </Badge>
        ) : null}
        {plan.monthlyInterestBasisPoints > 0 ? (
          <Badge tone="caution" icon={Percent}>
            {percent(plan.monthlyInterestBasisPoints / 100, 2)} ao mês
          </Badge>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setAberto((valor) => !valor)}>
          {aberto ? "Ocultar parcelas" : "Ver parcelas"}
        </Button>
        {!plan.isSettled ? (
          <Button
            size="sm"
            variant={simulando ? "secondary" : "ghost"}
            icon={Zap}
            onClick={() => setSimulando((valor) => !valor)}
          >
            {simulando ? "Fechar simulação" : "Simular antecipação"}
          </Button>
        ) : null}
      </div>

      {simulando ? <AnticipationPanel planId={plan.planId} /> : null}

      {aberto ? (
        <div className="mt-4">
          <DataTable
            caption={`Parcelas de ${plan.label}`}
            columns={[
              { key: "numero", header: "Parcela", width: "5.5rem" },
              { key: "competencia", header: "Competência" },
              { key: "situacao", header: "Situação", hideBelow: "sm" },
              { key: "vencimento", header: "Vence", align: "right", hideBelow: "sm" },
              { key: "valor", header: "Valor", align: "right" },
            ]}
          >
            {plan.entries.map((entry) => {
              const situacao = SITUACAO[entry.status] ?? SITUACAO.open;
              return (
                <Tr key={entry.number}>
                  <Td className="tabular text-caption text-ink-subtle">
                    {entry.number}/{plan.totalCount}
                  </Td>
                  <Td className="text-body-sm">{competenceShort(entry.competence)}</Td>
                  <Td hideBelow="sm">
                    <Badge tone={situacao.tom}>{situacao.texto}</Badge>
                  </Td>
                  <Td align="right" hideBelow="sm" className="tabular text-caption text-ink-subtle">
                    {date(entry.dueDate)}
                  </Td>
                  <Td align="right">
                    <span
                      className={`tabular text-body-sm ${
                        entry.status === "paid" ? "text-ink-subtle" : "font-medium text-ink"
                      }`}
                    >
                      {money(entry.amountCents)}
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </DataTable>
        </div>
      ) : null}
    </Panel>
  );
}
