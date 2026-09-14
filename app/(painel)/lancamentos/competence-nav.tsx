import Link from "next/link";

import type { Competence } from "../../../core/time/competence.ts";
import { competenceShort } from "../../ui/format.ts";

/** Navegação entre competências. Links de verdade — funcionam sem JavaScript. */
export function CompetenceNav({
  anterior,
  proxima,
  cardId,
}: {
  anterior: Competence;
  proxima: Competence;
  /** Preserva o recorte quando a navegação começou dentro de uma fatura. */
  cardId?: string;
}) {
  const classe =
    "rounded-md border border-line px-3 py-2 text-body-sm text-ink-muted hover:bg-surface-sunken";
  const href = (competence: Competence) =>
    `/lancamentos?competencia=${competence}${cardId ? `&cartao=${encodeURIComponent(cardId)}` : ""}`;

  return (
    <div className="flex items-center gap-1.5">
      <Link href={href(anterior)} className={classe} rel="prev">
        ← {competenceShort(anterior)}
      </Link>
      <Link href={href(proxima)} className={classe} rel="next">
        {competenceShort(proxima)} →
      </Link>
    </div>
  );
}
