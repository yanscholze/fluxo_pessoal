import { listAccounts, listCategories } from "../../../server/repositories/catalog.ts";
import { buildCapturesView } from "../../../server/services/captures.ts";
import { listReceiptRules } from "../../../server/services/reconciliation.ts";
import { listProjects } from "../../../server/services/work.ts";
import { currentUser } from "../../auth-context.ts";
import { DataTable, Td, Tr } from "../../ui/data-display.tsx";
import { dateShort, money } from "../../ui/format.ts";
import { Layers, ShieldCheck, Users, Zap } from "../../ui/icons.tsx";
import { Page, PageHeader, Stack } from "../../ui/page-frame.tsx";
import { Badge, Empty, Notice, Panel, PanelHeader, type Tone } from "../../ui/primitives.tsx";
import { CaptureQueue } from "./capture-queue.tsx";
import { PayerRules } from "./payer-rules.tsx";
import { SourceRules } from "./source-rules.tsx";

export const dynamic = "force-dynamic";

const SITUACAO: Record<string, { texto: string; tom: Tone }> = {
  confirmado: { texto: "Confirmado", tom: "positive" },
  ignorado: { texto: "Ignorado", tom: "neutral" },
  duplicado: { texto: "Duplicado", tom: "caution" },
};

/**
 * Automáticos.
 *
 * A garantia que a tela precisa transmitir é a de que nada entra sozinho. Por
 * isso a fila de revisão vem primeiro e ocupa o espaço nobre, e o aviso sobre
 * confirmação fica no topo em vez de virar nota de rodapé: uma automação
 * financeira sem consentimento explícito é o começo de uma planilha em que
 * ninguém confia.
 */
export default async function Automaticos() {
  const user = await currentUser();
  // O desvio de quem não tem sessão acontece em `proxy.ts`, como resposta
  // HTTP, e o layout mostra o aviso. Lançar aqui viraria exceção na
  // renderização — que o Vite transmite como erro para todas as abas.
  if (!user) return null;

  const [view, regras, projetos, contas, categorias] = await Promise.all([
    buildCapturesView(user.id),
    listReceiptRules(user.id),
    listProjects(user.id),
    listAccounts(user.id),
    listCategories(user.id),
  ]);

  return (
    <Page>
      <PageHeader
        title="Automações"
        description="O aplicativo lê as notificações do banco e sugere lançamentos."
      />

      <Stack gap="lg">
        <Notice tone="info" icon={ShieldCheck}>
          Nada entra na sua conta sem você confirmar. As sugestões ficam paradas aqui até serem revisadas.
        </Notice>

        <Panel>
          <PanelHeader
            title="Aguardando revisão"
            icon={Zap}
            hint={
              view.pending.length
                ? `${view.pending.length} ${view.pending.length === 1 ? "sugestão" : "sugestões"} para decidir`
                : undefined
            }
          />
          {view.pending.length ? (
            <CaptureQueue items={view.pending} options={view.options} />
          ) : (
            <Empty
              icon={Zap}
              title="Nenhuma sugestão pendente"
              hint="Conecte o aplicativo Android e permita a leitura de notificações para as compras aparecerem aqui."
            />
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Quem paga o quê"
            icon={Users}
            hint="Aponte o pagador uma vez; o recebimento passa a ser reconhecido"
          />
          <PayerRules
            rules={regras.map((regra) => ({
              id: regra.id,
              payerName: regra.payerName,
              target: regra.target,
              projectId: regra.projectId,
              accountId: regra.accountId,
              categoryId: regra.categoryId,
              isActive: regra.isActive,
              lastMatchedAt: regra.lastMatchedAt,
            }))}
            projects={projetos.map((projeto) => ({ id: projeto.id, name: projeto.name }))}
            accounts={contas.map((conta) => ({ id: conta.id, name: conta.name }))}
            categories={categorias
              .filter((categoria) => categoria.kind === "income")
              .map((categoria) => ({ id: categoria.id, name: categoria.name }))}
          />
        </Panel>

        <Panel>
          <PanelHeader
            title="Aplicativos"
            icon={Layers}
            hint="Bancos conhecidos já são lidos; qualquer outro só entra se você permitir"
          />
          <SourceRules sources={view.sources} options={view.options} />
        </Panel>

        {view.recent.length ? (
          <Panel>
            <PanelHeader title="Já resolvidas" hint="O que você decidiu recentemente" />
            <DataTable
              caption="Capturas já resolvidas"
              columns={[
                { key: "descricao", header: "Sugestão", flexible: true },
                { key: "app", header: "Aplicativo", hideBelow: "sm" },
                { key: "situacao", header: "Decisão", hideBelow: "sm" },
                { key: "data", header: "Data", align: "right", width: "5.5rem" },
                { key: "valor", header: "Valor", align: "right", width: "7.5rem" },
              ]}
            >
              {view.recent.map((item) => {
                const situacao = SITUACAO[item.status] ?? SITUACAO.ignorado;
                return (
                  <Tr key={item.id}>
                    <Td truncate className="truncate text-body">{item.description}</Td>
                    <Td hideBelow="sm" className="truncate text-body-sm text-ink-muted">
                      {item.sourceLabel ?? item.sourceApp}
                    </Td>
                    <Td hideBelow="sm">
                      <Badge tone={situacao.tom}>{situacao.texto}</Badge>
                    </Td>
                    <Td align="right" className="tabular text-caption text-ink-subtle">
                      {dateShort(item.occurredOn)}
                    </Td>
                    <Td align="right">
                      <span
                        className={`tabular text-body font-medium ${
                          item.kind === "income" ? "text-positive" : "text-ink"
                        }`}
                      >
                        {item.kind === "income" ? "+ " : "− "}
                        {money(item.amountCents)}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </DataTable>
          </Panel>
        ) : null}
      </Stack>
    </Page>
  );
}
