import { isConfigured } from "../../../server/services/ai/client.ts";
import { quotaStatus } from "../../../server/services/ai/quota.ts";
import { currentUser } from "../../auth-context.ts";
import { Bot, Camera, Sparkles } from "../../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../../ui/page-frame.tsx";
import { Empty, Meter, Panel, PanelHeader } from "../../ui/primitives.tsx";
import { AssistantChat } from "./assistant-chat.tsx";
import { ReceiptReader } from "./receipt-reader.tsx";

export const dynamic = "force-dynamic";

/**
 * Assistente.
 *
 * A cota aparece como barra e não só como número: "3 de 10" obriga a fazer a
 * conta; a barra mostra de relance se ainda dá para perguntar hoje.
 */
export default async function Assistente() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const configurado = isConfigured();
  const [conselho, cupom] = configurado
    ? await Promise.all([quotaStatus(user.id, "advice"), quotaStatus(user.id, "receipt")])
    : [null, null];

  return (
    <Page width="narrow">
      <PageHeader
        title="Assistente"
        description="Pergunte sobre a sua situação e leia cupons pela foto. As respostas usam os seus números, não regra genérica."
      />

      {configurado ? (
        <Stack gap="md">
          <Panel>
            <PanelHeader
              title="Perguntar"
              icon={Bot}
              action={<Cota usados={conselho!.limit - conselho!.remaining} limite={conselho!.limit} />}
            />
            <AssistantChat remaining={conselho!.remaining} />
          </Panel>

          <Panel>
            <PanelHeader
              title="Ler cupom"
              icon={Camera}
              action={<Cota usados={cupom!.limit - cupom!.remaining} limite={cupom!.limit} />}
            />
            <ReceiptReader remaining={cupom!.remaining} />
          </Panel>
        </Stack>
      ) : (
        <Panel>
          <Empty
            icon={Sparkles}
            title="O assistente não está configurado nesta instalação"
            hint="Defina OPENAI_API_KEY no ambiente para habilitar as consultas e a leitura de cupom. O resto do Fluxo funciona normalmente sem isso."
          />
        </Panel>
      )}
    </Page>
  );
}

function Cota({ usados, limite }: { usados: number; limite: number }) {
  const restantes = limite - usados;
  return (
    <div className="w-32 text-right">
      <p className="tabular text-caption text-ink-subtle">
        {restantes} de {limite} hoje
      </p>
      <Meter
        className="mt-1"
        size="sm"
        value={usados}
        total={limite}
        tone={restantes === 0 ? "negative" : restantes <= limite * 0.25 ? "caution" : "accent"}
        label="Cota diária"
      />
    </div>
  );
}
