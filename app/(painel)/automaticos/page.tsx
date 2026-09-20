import Link from "next/link";

import { join } from "../../ui/primitives.tsx";
import ImportacoesContent from "../importar/content.tsx";
import AutomaticosContent from "./content.tsx";

export const dynamic = "force-dynamic";

const ABAS = [
  { value: "automacoes", label: "Capturas" },
  { value: "importacoes", label: "Importações" },
] as const;

/**
 * Automações.
 *
 * Duas origens de lançamento que não passam pela digitação: a notificação que
 * o banco manda e o extrato que se importa. As duas terminam no mesmo lugar —
 * uma fila de revisão, onde nada entra no razão sem alguém confirmar.
 *
 * O seletor é o do desenho: uma cápsula com as duas opções, e não abas com
 * sublinhado. Ele guarda a escolha na URL, para recarregar não voltar sempre à
 * primeira.
 */
export default async function Automaticos({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; lote?: string }>;
}) {
  const params = await searchParams;
  const ativa = ABAS.find((aba) => aba.value === params.aba)?.value ?? "automacoes";

  return (
    <div className="content-area">
      <div className="mb-6 inline-flex rounded-xl border border-line bg-surface p-1">
        {ABAS.map((aba) => (
          <Link
            key={aba.value}
            href={`/automaticos?aba=${aba.value}`}
            aria-current={ativa === aba.value ? "page" : undefined}
            className={join(
              "inline-flex h-8 items-center rounded-lg px-4 text-caption font-medium transition-colors",
              ativa === aba.value
                ? "bg-accent text-accent-ink"
                : "text-ink-subtle hover:text-ink",
            )}
          >
            {aba.label}
          </Link>
        ))}
      </div>

      <section aria-label={ABAS.find((aba) => aba.value === ativa)?.label}>
        {ativa === "importacoes" ? (
          <ImportacoesContent searchParams={Promise.resolve(params)} />
        ) : (
          <AutomaticosContent />
        )}
      </section>
    </div>
  );
}
