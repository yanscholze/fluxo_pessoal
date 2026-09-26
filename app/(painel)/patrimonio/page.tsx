import { SectionTabs } from "../../ui/section-tabs.tsx";
import InvestimentosContent from "../investimentos/content.tsx";
import MetasContent from "../metas/content.tsx";
import SaudeContent from "../saude/content.tsx";
import PatrimonioContent from "./content.tsx";

export const dynamic = "force-dynamic";

const ABAS = [
  { value: "patrimonio", label: "Patrimônio" },
  { value: "investimentos", label: "Investimentos" },
  { value: "metas", label: "Metas" },
  { value: "saude", label: "Saúde financeira" },
] as const;

/**
 * Visão geral.
 *
 * Quatro perguntas sobre o mesmo assunto — o que eu tenho, onde está rendendo,
 * aonde quero chegar e se o caminho está saudável —, e por isso uma tela só
 * com quatro vistas, e não quatro telas.
 *
 * O Mesa não desenha nenhuma delas. O que ele desenha é o vocabulário: a
 * cápsula de troca de vista, o painel de vidro, o cartão de indicador com a
 * bolha de ícone. É esse vocabulário que estas quatro falam — a alternativa
 * seria inventar um segundo dialeto para as telas de fora do mockup, e aí o
 * produto passaria a ter duas caras.
 */
export default async function VisaoGeral({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const params = await searchParams;
  const ativa = ABAS.find((aba) => aba.value === params.aba)?.value ?? "patrimonio";

  return (
    <div className="content-area">
      <div className="mb-6">
        <SectionTabs
          basePath="/patrimonio"
          tabs={ABAS}
          active={ativa}
          label="Áreas da visão geral"
          query={params}
        />
      </div>

      <section aria-label={ABAS.find((aba) => aba.value === ativa)?.label}>
        {ativa === "investimentos" ? (
          <InvestimentosContent />
        ) : ativa === "metas" ? (
          <MetasContent />
        ) : ativa === "saude" ? (
          <SaudeContent />
        ) : (
          <PatrimonioContent />
        )}
      </section>
    </div>
  );
}
