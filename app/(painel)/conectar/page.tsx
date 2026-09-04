import { listDeviceSessions } from "../../../server/auth/session.ts";
import { currentUser } from "../../auth-context.ts";
import { ListRow } from "../../ui/data-display.tsx";
import { date } from "../../ui/format.ts";
import { ShieldCheck, Smartphone } from "../../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../../ui/page-frame.tsx";
import { Empty, Notice, Panel, PanelHeader } from "../../ui/primitives.tsx";
import { PairingForm } from "./pairing-form.tsx";

export const dynamic = "force-dynamic";

const PASSOS = [
  "O aplicativo gera um código de seis caracteres, válido por dez minutos.",
  "Você digita esse código aqui, já autenticado no navegador — é a sua sessão web que prova quem você é.",
  "O aplicativo troca o código por um token próprio, válido por 180 dias e revogável a qualquer momento.",
];

/**
 * Conectar aparelho.
 *
 * O código é o objeto central da tela, e os passos ficam ao lado dele — não
 * embaixo, numa seção separada. Quem está com o celular na mão precisa ver o
 * campo e a instrução ao mesmo tempo.
 */
export default async function Conectar() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const aparelhos = await listDeviceSessions(user.id);

  return (
    <Page width="narrow">
      <PageHeader
        title="Conectar aparelho"
        description="Autorize o aplicativo Android a acessar sua conta. Sua senha não passa pelo celular."
      />

      <Stack gap="md">
        <Panel>
          <PanelHeader
            title="Código do aplicativo"
            icon={Smartphone}
            hint="Abra o Fluxo no celular, toque em conectar e digite o código aqui"
          />

          <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-start">
            <PairingForm />

            <ol className="space-y-2.5 border-t border-line pt-4 sm:w-64 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              {PASSOS.map((passo, indice) => (
                <li key={passo} className="flex gap-2.5">
                  <span className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-inset text-caption font-medium text-ink-muted">
                    {indice + 1}
                  </span>
                  <span className="text-caption leading-relaxed text-ink-muted">{passo}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mt-5">
            <Notice tone="info" icon={ShieldCheck}>
              A senha nunca sai do navegador. Trocar a senha desconecta todos os aparelhos.
            </Notice>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title="Aparelhos conectados"
            icon={Smartphone}
            hint={aparelhos.length ? `${aparelhos.length} com acesso ativo` : undefined}
          />
          {aparelhos.length ? (
            <ul>
              {aparelhos.map((aparelho) => (
                <ListRow
                  key={aparelho.id}
                  icon={Smartphone}
                  title={aparelho.deviceName ?? "Aparelho sem nome"}
                  subtitle={`${aparelho.platform ?? "desconhecido"} · último acesso ${date(
                    aparelho.lastSeenAt.slice(0, 10) as never,
                  )}`}
                  meta={`expira ${date(aparelho.expiresAt.slice(0, 10) as never)}`}
                />
              ))}
            </ul>
          ) : (
            <Empty
              icon={Smartphone}
              title="Nenhum aparelho conectado"
              hint="O celular aparece aqui depois de autorizado."
              compact
            />
          )}
        </Panel>
      </Stack>
    </Page>
  );
}
