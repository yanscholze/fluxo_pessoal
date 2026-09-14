import { Page, PageHeader } from "../../ui/page-frame.tsx";
import { SectionTabs } from "../../ui/section-tabs.tsx";
import RecorrenciasContent from "./content.tsx";
import ParcelamentosContent from "../parcelamentos/content.tsx";
import AssinaturasContent from "../assinaturas/content.tsx";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "parcelamentos", label: "Parcelamentos" },
  { value: "recorrencias", label: "Recorrências" },
  { value: "assinaturas", label: "Assinaturas" },
] as const;

export default async function Planejamento({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const params = await searchParams;
  const active = TABS.find((tab) => tab.value === params.aba)?.value ?? "parcelamentos";

  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Organize o que vem depois"
        title="Compromissos"
        description="Compras parceladas, receitas e despesas recorrentes em um só lugar."
      >
        <SectionTabs basePath="/planejamento" tabs={TABS} active={active} label="Tipos de compromisso" query={params} />
      </PageHeader>
      <section aria-label={TABS.find((tab) => tab.value === active)?.label}>
        {active === "recorrencias" ? <RecorrenciasContent />
          : active === "assinaturas" ? <AssinaturasContent />
          : <ParcelamentosContent />}
      </section>
    </Page>
  );
}
