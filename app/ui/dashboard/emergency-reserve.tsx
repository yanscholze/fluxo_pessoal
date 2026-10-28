import Link from "next/link";

import type { HealthView } from "../../../server/services/health.ts";
import { decimal, money, percent } from "../format.ts";
import { PiggyBank } from "../icons.tsx";
import { Meter, Panel } from "../primitives.tsx";

/** Usa o mesmo diagnóstico da Saúde financeira, sem recalcular a reserva. */
export function EmergencyReserve({ reserve }: { reserve: HealthView["reserve"] }) {
  const possuiBase = reserve.monthlyEssentialCents > 0;
  const tom = reserve.monthsCovered >= 6 ? "positive" : reserve.monthsCovered >= 3 ? "caution" : "negative";

  return (
    <Panel variant="inset" padding="sm" className="mt-5" aria-label="Reserva de emergência">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-body-sm font-medium text-ink">
          <PiggyBank className="size-4 text-accent" aria-hidden /> Reserva de emergência
        </h3>
        <Link prefetch={false} href="/patrimonio?aba=saude" className="text-caption text-accent hover:underline">Ver detalhes</Link>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
        <p className="tabular text-figure-sm text-ink">{money(reserve.currentCents)}</p>
        {possuiBase ? <p className="text-body-sm text-ink-muted">Cobre <strong className="tabular font-medium text-ink">{decimal(reserve.monthsCovered)} meses</strong></p> : null}
      </div>
      {possuiBase ? <>
        <div className="mb-2 mt-2 flex flex-wrap justify-between gap-1 text-caption text-ink-subtle">
          <span>Meta de 6 meses: {money(reserve.targetCents)}</span>
          <span className="tabular">{percent(reserve.percent)}</span>
        </div>
        <Meter value={reserve.currentCents} total={reserve.targetCents} tone={tom} size="sm" label="Reserva de emergência: progresso para seis meses" />
        <p className="mt-2 text-caption text-ink-subtle">Base de cálculo: {money(reserve.monthlyEssentialCents)} de gasto essencial médio por mês.</p>
      </> : <p className="mt-2 text-caption text-ink-subtle">Cobertura indisponível: marque categorias essenciais e registre seus gastos para calcular a média mensal e a meta de seis meses.</p>}
    </Panel>
  );
}
