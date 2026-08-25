"use client";

/**
 * Simulador de antecipação.
 *
 * Uma linha por cenário — antecipar 1, 2, 3… parcelas — para o usuário
 * comparar. Numa compra sem juros a economia é zero, e a tela diz isso em vez
 * de esconder a coluna: o ganho ali é encurtar o compromisso e liberar limite,
 * não pagar menos.
 */

import { useEffect, useState } from "react";

import type { AnticipationScenario } from "../../../server/services/installments.ts";
import { Empty } from "../../ui/primitives.tsx";
import { competenceShort, money } from "../../ui/format.ts";

export function AnticipationPanel({ planId }: { planId: string }) {
  const [cenarios, setCenarios] = useState<AnticipationScenario[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    fetch(`/api/v1/installments/${planId}/anticipation`)
      .then(async (resposta) => {
        const corpo = await resposta.json();
        if (!ativo) return;
        if (!resposta.ok) throw new Error(corpo?.error?.message ?? "Falha ao simular");
        setCenarios(corpo.data.scenarios);
      })
      .catch((causa: Error) => ativo && setErro(causa.message));
    return () => {
      ativo = false;
    };
  }, [planId]);

  if (erro) {
    return <p className="mt-3 text-body-sm text-negative">{erro}</p>;
  }

  if (!cenarios) {
    return <p className="mt-3 text-body-sm text-ink-subtle">Calculando cenários…</p>;
  }

  if (!cenarios.length) {
    return (
      <div className="mt-3">
        <Empty title="Nenhuma parcela em aberto para antecipar" />
      </div>
    );
  }

  const temJuros = cenarios.some((cenario) => cenario.savingsCents > 0);

  return (
    <div className="mt-4 overflow-x-auto rounded-md border border-line">
      <table className="w-full min-w-[34rem] text-body-sm">
        <thead>
          <tr className="border-b border-line text-left text-ink-subtle">
            <th className="px-3 py-2 font-medium">Antecipar</th>
            <th className="px-3 py-2 text-right font-medium">Paga hoje</th>
            {temJuros ? <th className="px-3 py-2 text-right font-medium">Economia</th> : null}
            <th className="px-3 py-2 text-right font-medium">Libera por mês</th>
            <th className="px-3 py-2 text-right font-medium">Novo término</th>
          </tr>
        </thead>
        <tbody>
          {cenarios.map((cenario) => (
            <tr key={cenario.count} className="border-b border-line last:border-0">
              <td className="px-3 py-2 text-ink">
                {cenario.count} parcela{cenario.count > 1 ? "s" : ""}
              </td>
              <td className="tabular px-3 py-2 text-right text-ink">{money(cenario.dueTodayCents)}</td>
              {temJuros ? (
                <td className="tabular px-3 py-2 text-right text-positive">{money(cenario.savingsCents)}</td>
              ) : null}
              <td className="tabular px-3 py-2 text-right text-ink-muted">
                {money(cenario.averageMonthlyReliefCents)}
              </td>
              <td className="px-3 py-2 text-right text-ink-muted">
                {cenario.newEndCompetence ? competenceShort(cenario.newEndCompetence) : "quita tudo"}
                {cenario.monthsShortened > 0 ? (
                  <span className="ml-1 text-ink-subtle">(−{cenario.monthsShortened}m)</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {!temJuros ? (
        <p className="border-t border-line px-3 py-2 text-caption text-ink-subtle">
          Compra sem juros: antecipar não gera desconto. O ganho é encurtar o compromisso e liberar limite.
        </p>
      ) : null}
    </div>
  );
}
