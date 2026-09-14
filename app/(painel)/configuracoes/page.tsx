import { Integrations } from "./integrations.tsx";
import { listCategories } from "../../../server/repositories/catalog.ts";
import { currentUser } from "../../auth-context.ts";
import { LinkButton } from "../../ui/controls.tsx";
import { Download } from "../../ui/icons.tsx";
import { Page, PageHeader } from "../../ui/page-frame.tsx";
import { Notice, Panel, PanelHeader } from "../../ui/primitives.tsx";
import { Appearance } from "./appearance.tsx";
import { CategoryManager } from "./category-manager.tsx";
import { PasswordForm } from "./password-form.tsx";
import { SettingsTabs } from "./settings-tabs.tsx";
import AparelhosContent from "../conectar/content.tsx";

export const dynamic = "force-dynamic";

/**
 * Configurações.
 *
 * Em abas, e não numa pilha: as quatro áreas não têm relação entre si, e
 * empilhá-las obrigava a rolar por categorias para chegar em segurança.
 */
export default async function Configuracoes({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const [categories, params] = await Promise.all([listCategories(user.id), searchParams]);

  return (
    <Page>
      <PageHeader eyebrow={user.email} title="Configurações" description={user.displayName} />

      <SettingsTabs
        activeSection={params.aba}
        sections={[
          {
            value: "categorias",
            label: "Categorias",
            content: (
              <Panel>
                <PanelHeader
                  title="Categorias"
                  hint="Marcar como essencial alimenta o cálculo da reserva de emergência"
                />
                <CategoryManager
                  categories={categories.map((category) => ({
                    id: category.id,
                    name: category.name,
                    kind: category.kind,
                    color: category.color,
                    isEssential: category.isEssential,
                    excludeFromFreeToSpend: category.excludeFromFreeToSpend,
                  }))}
                />
              </Panel>
            ),
          },
          {
            value: "aparencia",
            label: "Aparência",
            content: (
              <Panel>
                <PanelHeader title="Aparência" hint="Vale só neste navegador" />
                <Appearance />
              </Panel>
            ),
          },
          {
            value: "integracoes",
            label: "Integrações",
            content: <Integrations />,
          },
          {
            value: "seguranca",
            label: "Segurança",
            content: (
              <Panel>
                <PanelHeader title="Senha" hint="Trocar a senha desconecta todos os aparelhos" />
                <PasswordForm />
              </Panel>
            ),
          },
          {
            value: "aparelhos",
            label: "Aparelhos",
            content: <AparelhosContent />,
          },
          {
            value: "dados",
            label: "Seus dados",
            content: (
              <Panel>
                <PanelHeader title="Seus dados" hint="Tudo que o Fluxo guarda sobre você" />
                <Notice tone="info">
                  A exportação sai em CSV com todo o histórico, pronta para abrir em planilha.
                </Notice>
                <div className="mt-4 flex flex-wrap gap-2">
                  <LinkButton
                    href="/api/v1/reports/export?periodo=todos&fluxo=saidas"
                    variant="secondary"
                    icon={Download}
                  >
                    Exportar saídas
                  </LinkButton>
                  <LinkButton
                    href="/api/v1/reports/export?periodo=todos&fluxo=entradas"
                    variant="secondary"
                    icon={Download}
                  >
                    Exportar entradas
                  </LinkButton>
                </div>
              </Panel>
            ),
          },
        ]}
      />
    </Page>
  );
}
