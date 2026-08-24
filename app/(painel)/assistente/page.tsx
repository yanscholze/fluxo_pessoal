import { redirect } from "next/navigation";

import { isConfigured } from "../../../server/services/ai/client.ts";
import { quotaStatus } from "../../../server/services/ai/quota.ts";
import { currentUser } from "../../auth-context.ts";
import { Card, Empty, SectionHeading } from "../../ui/primitives.tsx";
import { AssistantChat } from "./assistant-chat.tsx";
import { ReceiptReader } from "./receipt-reader.tsx";

export const dynamic = "force-dynamic";

export default async function Assistente() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const configurado = isConfigured();
  const [conselho, cupom] = configurado
    ? await Promise.all([quotaStatus(user.id, "advice"), quotaStatus(user.id, "receipt")])
    : [null, null];

  return (
    <main className="mx-auto w-full max-w-[64rem] px-5 py-8 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-[1.625rem] font-semibold tracking-[-0.02em] text-ink">Assistente</h1>
        <p className="mt-1 text-[0.875rem] text-ink-muted">
          Pergunte sobre a sua situação e leia cupons pela foto.
        </p>
      </header>

      {configurado ? (
        <div className="space-y-5">
          <Card>
            <SectionHeading
              title="Perguntar"
              hint={`${conselho!.remaining} de ${conselho!.limit} consultas restantes hoje`}
            />
            <AssistantChat remaining={conselho!.remaining} />
          </Card>

          <Card>
            <SectionHeading
              title="Ler cupom"
              hint={`${cupom!.remaining} de ${cupom!.limit} leituras restantes hoje`}
            />
            <ReceiptReader remaining={cupom!.remaining} />
          </Card>
        </div>
      ) : (
        <Card>
          <Empty
            title="O assistente não está configurado nesta instalação"
            hint="Defina OPENAI_API_KEY no ambiente para habilitar as consultas e a leitura de cupom. O resto do Fluxo funciona normalmente sem isso."
          />
        </Card>
      )}
    </main>
  );
}
