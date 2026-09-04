/**
 * Seletor de recorte, compartilhado pelos relatórios.
 *
 * Existia colado na tela de resumo. Com quatro relatórios, copiá-lo em cada um
 * garantiria que os quatro divergissem — um ganharia "24 meses", outro perderia
 * "todos", e a comparação entre eles deixaria de ser possível.
 */

import Link from "next/link";

import type { ReportPeriod } from "../../../server/services/reports.ts";
import { Toolbar } from "../../ui/page-frame.tsx";
import { join } from "../../ui/primitives.tsx";

export const PERIODOS: readonly (readonly [ReportPeriod, string])[] = [
  ["mes", "Este mês"],
  ["3m", "3 meses"],
  ["6m", "6 meses"],
  ["12m", "12 meses"],
  ["todos", "Tudo"],
];

export function parsePeriodo(valor: string | undefined): ReportPeriod {
  return PERIODOS.some(([chave]) => chave === valor) ? (valor as ReportPeriod) : "6m";
}

export function PeriodFilter({ base, atual }: { base: string; atual: ReportPeriod }) {
  return (
    <Toolbar>
      {PERIODOS.map(([chave, rotulo]) => (
        <Link
          key={chave}
          href={`${base}?periodo=${chave}`}
          aria-current={atual === chave ? "page" : undefined}
          className={join(
            "inline-flex h-8 shrink-0 items-center rounded-md border px-3 text-body-sm font-medium transition-colors",
            atual === chave
              ? "border-accent-edge bg-accent-wash text-accent"
              : "border-line-strong bg-surface text-ink-muted hover:bg-surface-inset hover:text-ink",
          )}
        >
          {rotulo}
        </Link>
      ))}
    </Toolbar>
  );
}
