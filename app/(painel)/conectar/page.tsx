import { redirect } from "next/navigation";

import { listDeviceSessions } from "../../../server/auth/session.ts";
import { currentUser } from "../../auth-context.ts";
import { Card, Empty, SectionHeading } from "../../ui/primitives.tsx";
import { date } from "../../ui/format.ts";
import { PairingForm } from "./pairing-form.tsx";

export const dynamic = "force-dynamic";

export default async function Conectar() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const aparelhos = await listDeviceSessions(user.id);

  return (
    <main className="mx-auto w-full max-w-[48rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Conectar aparelho</h1>
        <p className="mt-1 text-[0.875rem] text-ink-muted">
          Autorize o aplicativo Android a acessar sua conta. Sua senha não passa pelo celular.
        </p>
      </header>

      <Card>
        <SectionHeading
          title="Código do aplicativo"
          hint="Abra o Fluxo no celular, toque em conectar e digite o código aqui"
        />
        <PairingForm />
      </Card>

      <Card className="mt-5">
        <SectionHeading title="Aparelhos conectados" />
        {aparelhos.length ? (
          <ul>
            {aparelhos.map((aparelho) => (
              <li
                key={aparelho.id}
                className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0"
              >
                <div>
                  <p className="text-[0.875rem] text-ink">{aparelho.deviceName ?? "Aparelho sem nome"}</p>
                  <p className="text-[0.75rem] text-ink-subtle">
                    {aparelho.platform ?? "desconhecido"} · último acesso{" "}
                    {date(aparelho.lastSeenAt.slice(0, 10) as never)}
                  </p>
                </div>
                <p className="text-[0.75rem] text-ink-subtle">
                  expira {date(aparelho.expiresAt.slice(0, 10) as never)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty
            title="Nenhum aparelho conectado"
            hint="O celular aparece aqui depois de autorizado."
          />
        )}
      </Card>

      <Card className="mt-5">
        <SectionHeading title="Como funciona" />
        <ol className="space-y-2 text-[0.875rem] text-ink-muted">
          <li>
            <strong className="font-medium text-ink">1.</strong> O aplicativo gera um código de seis
            caracteres, válido por dez minutos.
          </li>
          <li>
            <strong className="font-medium text-ink">2.</strong> Você digita esse código aqui, já
            autenticado no navegador — é a sua sessão web que prova quem você é.
          </li>
          <li>
            <strong className="font-medium text-ink">3.</strong> O aplicativo troca o código por um token
            próprio, válido por 180 dias e revogável a qualquer momento.
          </li>
        </ol>
        <p className="mt-3 text-[0.75rem] text-ink-subtle">
          A senha nunca sai do navegador. Trocar a senha desconecta todos os aparelhos.
        </p>
      </Card>
    </main>
  );
}
