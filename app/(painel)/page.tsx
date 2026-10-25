import Link from "next/link";
import { buildAssistantState } from "../../server/services/ai/assistant-state.ts";
import { currentUser } from "../auth-context.ts";
import { Page, PageHeader } from "../ui/page-frame.tsx";
import { Panel } from "../ui/primitives.tsx";
import { Camera } from "../ui/icons.tsx";
import { AssistantChat } from "./assistente/assistant-chat.tsx";
import { ReceiptReader } from "./assistente/receipt-reader.tsx";

export const dynamic = "force-dynamic";

type Params = { notificationId?: string; conversationId?: string };

export default async function FluxoAi({ searchParams }: { searchParams?: Promise<Params> }) {
  const user = await currentUser();
  if (!user) return null;
  const params = await searchParams;
  const state = await buildAssistantState(user.id, params ?? {});

  return (
    <Page>
      <PageHeader title="Fluxo IA" description={`Olá, ${user.displayName.trim().split(/\s+/)[0]}. Vamos entender seus números e planejar os próximos passos.`} />
      <AssistantChat key={`${params?.notificationId ?? ""}:${params?.conversationId ?? ""}`} initialState={state} notificationId={params?.notificationId} conversationId={params?.conversationId} />
      <Panel className="mt-5" padding="none">
        <details className="group p-5">
          <summary className="flex min-h-11 cursor-pointer items-center gap-3 text-body-sm font-semibold text-ink marker:text-accent">
            <Camera size={19} className="text-accent" aria-hidden />Ler um cupom ou comprovante
            <span className="ml-auto text-caption font-normal text-ink-subtle">Ferramenta</span>
          </summary>
          <div className="mt-3 max-w-measure-lg">
            <p className="mb-4 text-body-sm text-ink-muted">Extraia os dados de uma foto e confira antes de registrar. Nada é lançado automaticamente.</p>
            {state.configured ? <ReceiptReader remaining={state.receipt.remaining} /> : <p className="text-body-sm text-ink-muted">Configure seu provedor em <Link className="text-accent underline" href="/configuracoes?aba=integracoes">Configurações → Integrações</Link>.</p>}
          </div>
        </details>
      </Panel>
    </Page>
  );
}
