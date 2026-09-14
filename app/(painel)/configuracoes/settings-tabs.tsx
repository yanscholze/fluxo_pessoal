import type { ReactNode } from "react";

import { SectionTabs } from "../../ui/section-tabs.tsx";

export type Secao = { readonly value: string; readonly label: string; readonly content: ReactNode };

/** Keep each form mounted while URL-based navigation selects its visible section. */
export function SettingsTabs({
  sections,
  activeSection,
}: {
  sections: readonly Secao[];
  activeSection?: string;
}) {
  const active = sections.find((section) => section.value === activeSection)?.value ?? sections[0]?.value ?? "";

  return (
    <div>
      <SectionTabs
        basePath="/configuracoes"
        tabs={sections}
        active={active}
        label="Áreas das configurações"
      />
      <div className="mt-5">
        {sections.map((section) => (
          <section key={section.value} hidden={section.value !== active} aria-label={section.label}>
            {section.content}
          </section>
        ))}
      </div>
    </div>
  );
}
