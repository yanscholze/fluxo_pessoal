import { redirect } from "next/navigation";

import { listCategories } from "../../../server/repositories/catalog.ts";
import { listDeviceSessions } from "../../../server/auth/session.ts";
import { currentUser } from "../../auth-context.ts";
import { LinkButton } from "../../ui/controls.tsx";
import { ListRow } from "../../ui/data-display.tsx";
import { date } from "../../ui/format.ts";
import { Download, Smartphone } from "../../ui/icons.tsx";
import { Page, PageHeader } from "../../ui/page-frame.tsx";
import { Empty, Notice, Panel, PanelHeader } from "../../ui/primitives.tsx";
import { Appearance } from "./appearance.tsx";
import { CategoryManager } from "./category-manager.tsx";
import { PasswordForm } from "./password-form.tsx";
import { SettingsTabs } from "./settings-tabs.tsx";

export const dynamic = "force-dynamic";

/**
 * Configurações.
 *
 * Em abas, e não numa pilha: as quatro áreas não têm relação entre si, e
 * empilhá-las obrigava a rolar por categorias para chegar em segurança.
 */
export default async function Configuracoes() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const [categories, devices] = await Promise.all([
    listCategories(user.id),
    listDeviceSessions(user.id),
  ]);

  return (
    <Page width="narrow">
      <PageHeader eyebrow={user.email} title="Configurações" description={user.displayName} />

      <SettingsTabs
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
            value: "seguranca",
            label: "Segurança",
            content: (
              <div className="space-y-5">
                <Panel>
                  <PanelHeader title="Senha" hint="Trocar a senha desconecta todos os aparelhos" />
                  <PasswordForm />
                </Panel>

                <Panel>
                  <PanelHeader
                    title="Aparelhos conectados"
                    icon={Smartphone}
                    hint={devices.length ? `${devices.length} com acesso ativo` : undefined}
                  />
                  {devices.length ? (
                    <ul>
                      {devices.map((device) => (
                        <ListRow
                          key={device.id}
                          icon={Smartphone}
                          title={device.deviceName ?? "Aparelho sem nome"}
                          subtitle={`${device.platform ?? "desconhecido"} · último acesso ${date(
                            device.lastSeenAt.slice(0, 10) as never,
                          )}`}
                          meta={`expira ${date(device.expiresAt.slice(0, 10) as never)}`}
                        />
                      ))}
                    </ul>
                  ) : (
                    <Empty
                      icon={Smartphone}
                      title="Nenhum aparelho conectado"
                      hint="O aplicativo Android aparece aqui depois de pareado."
                      compact
                    />
                  )}
                </Panel>
              </div>
            ),
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
