import { redirect } from "next/navigation";

import { listCategories } from "../../../server/repositories/catalog.ts";
import { listDeviceSessions } from "../../../server/auth/session.ts";
import { currentUser } from "../../auth-context.ts";
import { Card, Empty, SectionHeading } from "../../ui/primitives.tsx";
import { date } from "../../ui/format.ts";
import { Appearance } from "./appearance.tsx";
import { CategoryManager } from "./category-manager.tsx";
import { PasswordForm } from "./password-form.tsx";

export const dynamic = "force-dynamic";

export default async function Configuracoes() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const [categories, devices] = await Promise.all([
    listCategories(user.id),
    listDeviceSessions(user.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-[64rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Configurações</h1>
        <p className="mt-1 text-[0.875rem] text-ink-muted">
          {user.displayName} · {user.email}
        </p>
      </header>

      <div className="space-y-5">
        <Card>
          <SectionHeading
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
        </Card>

        <Card>
          <SectionHeading title="Aparência" />
          <Appearance />
        </Card>

        <Card>
          <SectionHeading title="Segurança" hint="Trocar a senha desconecta todos os aparelhos" />
          <PasswordForm />
        </Card>

        <Card>
          <SectionHeading title="Aparelhos conectados" />
          {devices.length ? (
            <ul>
              {devices.map((device) => (
                <li
                  key={device.id}
                  className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
                >
                  <div>
                    <p className="text-[0.875rem] text-ink">{device.deviceName ?? "Aparelho sem nome"}</p>
                    <p className="text-[0.75rem] text-ink-subtle">
                      {device.platform ?? "desconhecido"} · último acesso{" "}
                      {date(device.lastSeenAt.slice(0, 10) as never)}
                    </p>
                  </div>
                  <p className="text-[0.75rem] text-ink-subtle">
                    expira {date(device.expiresAt.slice(0, 10) as never)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty
              title="Nenhum aparelho conectado"
              hint="O aplicativo Android aparece aqui depois de pareado."
            />
          )}
        </Card>

        <Card>
          <SectionHeading title="Seus dados" hint="Tudo que o Fluxo guarda sobre você" />
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/v1/reports/export?periodo=todos&fluxo=saidas"
              className="rounded-[--radius-control] border border-line px-4 py-2 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken"
            >
              Exportar saídas (CSV)
            </a>
            <a
              href="/api/v1/reports/export?periodo=todos&fluxo=entradas"
              className="rounded-[--radius-control] border border-line px-4 py-2 text-[0.8125rem] text-ink-muted hover:bg-surface-sunken"
            >
              Exportar entradas (CSV)
            </a>
          </div>
        </Card>
      </div>
    </main>
  );
}
