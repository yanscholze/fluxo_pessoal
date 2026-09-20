import { SectionTabs } from "../../ui/section-tabs.tsx";
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
 * primeira — e é o mesmo componente que Configurações e Patrimônio usam, para
 * a cápsula não nascer diferente em cada tela.
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
      <div className="mb-6">
        <SectionTabs
          basePath="/automaticos"
          tabs={ABAS}
          active={ativa}
          label="Origens de lançamento automático"
        />
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
