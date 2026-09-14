import { Page, PageHeader } from "../../ui/page-frame.tsx";
import { SectionTabs } from "../../ui/section-tabs.tsx";
import PatrimonioContent from "./content.tsx";
import InvestimentosContent from "../investimentos/content.tsx";
import MetasContent from "../metas/content.tsx";
import SaudeContent from "../saude/content.tsx";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "patrimonio", label: "Patrimônio" },
  { value: "investimentos", label: "Investimentos" },
  { value: "metas", label: "Metas" },
  { value: "saude", label: "Saúde financeira" },
] as const;

export default async function VisaoGeral({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const params = await searchParams;
  const active = TABS.find((tab) => tab.value === params.aba)?.value ?? "patrimonio";

  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Seu próximo capítulo"
        title="Visão geral"
        description="Seu patrimônio, o que você investe e os objetivos que quer alcançar."
      >
        <SectionTabs basePath="/patrimonio" tabs={TABS} active={active} label="Áreas da visão geral" query={params} />
      </PageHeader>
      <section aria-label={TABS.find((tab) => tab.value === active)?.label}>
        {active === "investimentos" ? <InvestimentosContent />
          : active === "metas" ? <MetasContent />
          : active === "saude" ? <SaudeContent />
          : <PatrimonioContent />}
      </section>
    </Page>
  );
}
