import Link from "next/link";

import type { Competence } from "../../../core/time/competence.ts";
import { competenceShort } from "../../ui/format.ts";

/** Navegação entre competências. Links de verdade — funcionam sem JavaScript. */
export function CompetenceNav({ anterior, proxima }: { anterior: Competence; proxima: Competence }) {
  const classe =
    "rounded-[--radius-control] border border-line px-3 py-2 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken";

  return (
    <div className="flex items-center gap-1.5">
      <Link href={`/lancamentos?competencia=${anterior}`} className={classe} rel="prev">
        ← {competenceShort(anterior)}
      </Link>
      <Link href={`/lancamentos?competencia=${proxima}`} className={classe} rel="next">
        {competenceShort(proxima)} →
      </Link>
    </div>
  );
}
