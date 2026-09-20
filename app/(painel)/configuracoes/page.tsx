import { listCategories } from "../../../server/repositories/catalog.ts";
import { currentUser } from "../../auth-context.ts";
import { LinkButton } from "../../ui/controls.tsx";
import { Download } from "../../ui/icons.tsx";
import { Notice, Panel, PanelHeader } from "../../ui/primitives.tsx";
import AparelhosContent from "../conectar/content.tsx";
import { Appearance } from "./appearance.tsx";
import { CategoryManager } from "./category-manager.tsx";
import { Integrations } from "./integrations.tsx";
import { PasswordForm } from "./password-form.tsx";
import { SettingsTabs } from "./settings-tabs.tsx";
import { SignOut } from "./sign-out.tsx";

export const dynamic = "force-dynamic";

/**
 * Configurações.
 *
 * Em cápsulas, e não numa pilha: as seis áreas não têm relação entre si, e
 * empilhá-las obrigava a rolar por categorias para chegar em segurança.
 *
 * A identidade abre a tela porque é a pergunta silenciosa de quem chega aqui
 * — "é esta a conta mesmo?" —, e porque o cartão de usuário do rodapé da
 * lateral leva justamente para cá.
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
    <div className="content-area">
      <section className="glass-panel mb-5 flex items-center gap-4 p-6">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent-wash text-body font-semibold text-accent"
          aria-hidden
        >
          {iniciais(user.displayName)}
        </span>
        <div className="min-w-0">
          <p className="metric-label">Sua conta</p>
          <p className="mt-1 truncate text-lg font-medium text-ink">{user.displayName}</p>
          <p className="truncate text-body-sm text-ink-subtle">{user.email}</p>
        </div>
      </section>

      <SettingsTabs
        activeSection={params.aba}
        sections={[
          {
            value: "categorias",
            label: "Categorias",
            content: (
              <Panel padding="lg">
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
              <Panel padding="lg">
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
              <div className="space-y-5">
                <Panel padding="lg">
                  <PanelHeader title="Senha" hint="Trocar a senha desconecta todos os aparelhos" />
                  <PasswordForm />
                </Panel>
                <Panel padding="lg">
                  <PanelHeader
                    title="Sessão"
                    hint="Encerra só neste navegador; os aparelhos conectados continuam"
                  />
                  <SignOut />
                </Panel>
              </div>
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
              <Panel padding="lg">
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
    </div>
  );
}

/** As mesmas iniciais do cartão de usuário da lateral. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase();
  return `${partes[0]![0]}${partes.at(-1)![0]}`.toUpperCase();
}
