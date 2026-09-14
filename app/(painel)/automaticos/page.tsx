import { Page, PageHeader } from "../../ui/page-frame.tsx";
import { SectionTabs } from "../../ui/section-tabs.tsx";
import AutomaticosContent from "./content.tsx";
import ImportacoesContent from "../importar/content.tsx";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "automacoes", label: "Automações" },
  { value: "importacoes", label: "Importações" },
] as const;

export default async function Automaticos({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; lote?: string }>;
}) {
  const params = await searchParams;
  const active = TABS.find((tab) => tab.value === params.aba)?.value ?? "automacoes";

  return (
    <Page>
      <PageHeader
        eyebrow="Menos trabalho manual"
        title="Automações e importações"
        description="Receba sugestões dos seus bancos ou traga um extrato. Você revisa antes de confirmar."
      >
        <SectionTabs basePath="/automaticos" tabs={TABS} active={active} label="Origens de lançamentos" query={params} />
      </PageHeader>
      <section aria-label={TABS.find((tab) => tab.value === active)?.label}>
        {active === "importacoes" ? <ImportacoesContent searchParams={Promise.resolve(params)} /> : <AutomaticosContent />}
      </section>
    </Page>
  );
}
