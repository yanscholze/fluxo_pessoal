/**
 * Integrações externas.
 *
 * Existe para responder uma pergunta que só o servidor sabe: **o token pegou**.
 * Sem esta tela, quem acabou de configurar o segredo descobre pelo silêncio —
 * abre um projeto e o painel do repositório continua dizendo que a leitura não
 * está ligada, sem dizer se o token está errado, ausente ou sem permissão.
 *
 * Nenhum segredo aparece aqui, nem parte dele. O que se mostra é se existe e se
 * funciona, que é tudo que se precisa saber para agir.
 */

import { isConfigured as aiConfigurado } from "../../../server/services/ai/client.ts";
import { isConfigured as githubConfigurado, listRepositories } from "../../../server/services/github.ts";
import { Bot, Github } from "../../ui/icons.tsx";
import { Badge, Notice, Panel, PanelHeader } from "../../ui/primitives.tsx";

export async function Integrations() {
  const temGithub = githubConfigurado();
  // Só consulta se há token: sem ele a chamada é garantidamente inútil.
  const repositorios = temGithub ? await listRepositories() : null;

  return (
    <div className="space-y-5">
      <Panel>
        <PanelHeader
          title="GitHub"
          icon={Github}
          hint="Commits, pull requests e issues na tela do projeto"
          action={
            temGithub && repositorios ? (
              <Badge tone="positive">ligado</Badge>
            ) : temGithub ? (
              <Badge tone="negative">token recusado</Badge>
            ) : (
              <Badge tone="neutral">desligado</Badge>
            )
          }
        />

        {temGithub && repositorios ? (
          <Notice tone="positive">
            Funcionando. O token alcança{" "}
            <strong>
              {repositorios.length} {repositorios.length === 1 ? "repositório" : "repositórios"}
            </strong>
            , que aparecem para escolher na tela de cada projeto.
          </Notice>
        ) : temGithub ? (
          <Notice tone="negative">
            Existe um token configurado, mas o GitHub o recusou. Confira se ele não expirou e se tem
            permissão de leitura nos repositórios que você quer vincular.
          </Notice>
        ) : (
          <div className="space-y-3">
            <Notice tone="info">
              Sem token, a tela do projeto continua mostrando os atalhos do repositório — issues,
              pull requests, commits — e deixa de mostrar a atividade e a lista para escolher.
            </Notice>

            <div className="space-y-2 text-body-sm text-ink-muted">
              <p>Para ligar, crie um token de leitura e guarde-o como segredo do Worker:</p>
              <ol className="ml-4 list-decimal space-y-1.5">
                <li>
                  Em{" "}
                  <a
                    href="https://github.com/settings/personal-access-tokens/new"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent hover:underline"
                  >
                    github.com/settings/personal-access-tokens
                  </a>
                  , crie um token <em>fine-grained</em> com acesso aos repositórios que quer
                  vincular e permissão <strong>somente leitura</strong> em Contents, Issues e Pull
                  requests.
                </li>
                <li>
                  No desenvolvimento local, escreva <code className="tabular">GITHUB_TOKEN=…</code>{" "}
                  em <code className="tabular">.dev.vars</code> na raiz do projeto.
                </li>
                <li>
                  Em produção, rode{" "}
                  <code className="tabular">
                    npx wrangler secret put GITHUB_TOKEN --config dist/server/wrangler.json
                  </code>{" "}
                  e cole o token quando ele pedir.
                </li>
              </ol>
              <p className="text-caption text-ink-subtle">
                O token nunca é guardado no banco — nem aqui, nem na ficha do projeto. Um vazamento
                do Fluxo não pode virar acesso ao código dos seus clientes. Nenhuma rota escreve no
                GitHub: não abre issue, não comenta, não faz merge.
              </p>
            </div>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Assistente"
          icon={Bot}
          hint="Perguntas em linguagem natural e leitura de cupom fiscal"
          action={
            aiConfigurado() ? <Badge tone="positive">ligado</Badge> : <Badge tone="neutral">desligado</Badge>
          }
        />

        {aiConfigurado() ? (
          <Notice tone="positive">Funcionando.</Notice>
        ) : (
          <Notice tone="info">
            Guarde a chave como <code className="tabular">OPENAI_API_KEY</code> — em{" "}
            <code className="tabular">.dev.vars</code> no desenvolvimento, ou por{" "}
            <code className="tabular">wrangler secret put</code> em produção.
          </Notice>
        )}
      </Panel>
    </div>
  );
}
