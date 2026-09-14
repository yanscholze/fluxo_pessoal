# Abrir o Fluxo no Codex

Este arquivo existe porque quase tudo que um agente precisa saber sobre este
projeto **não está no repositório**: mora na configuração pessoal do Claude
Code, na máquina onde ele foi usado. Trocar de ferramenta — ou de máquina —
perde isso silenciosamente, e o sintoma não é um erro: é o agente refazendo
escolhas que já tinham sido feitas, e refazendo-as diferente.

O prompt abaixo é para colar no Codex **na primeira vez** que a pasta for
aberta. Ele manda o Codex descobrir a própria configuração, escrever um
`AGENTS.md` a partir do que já existe aqui, registrar o servidor MCP e deixar o
ambiente pronto. Depois disso, o `AGENTS.md` fica versionado e ninguém precisa
repetir nada.

O inventário do que está sendo portado está no fim deste arquivo.

---

## O prompt

```text
Você está abrindo o projeto Fluxo pela primeira vez neste ambiente. Antes de
qualquer tarefa de código, deixe o ambiente e o seu próprio contexto prontos.
Faça tudo de uma vez, sem me perguntar entre uma etapa e outra; só me procure se
algo exigir decisão minha ou senha.

1. DESCUBRA A SUA PRÓPRIA CONFIGURAÇÃO ANTES DE ESCREVER NELA

Não presuma caminhos nem formatos. Confirme, com `codex --help` e com o que
existir na máquina, onde ficam:
  - o arquivo de configuração onde se declaram servidores MCP;
  - o diretório de prompts/comandos personalizados, se houver;
  - o arquivo de instruções de projeto que você lê sozinho ao abrir a pasta
    (a convenção é AGENTS.md na raiz).
Se alguma dessas coisas não existir nesta versão, diga qual e siga sem ela — não
invente um formato.

2. ESCREVA O AGENTS.md DA RAIZ

É o item mais importante: é ele que sobrevive à troca de máquina. Monte-o lendo,
nesta ordem:
  - README.md e mobile/README.md
  - docs/01-regras-de-negocio.md, docs/02-arquitetura.md, docs/03-publicacao.md
  - docs/api-v1.md
  - package.json (scripts) e os arquivos em scripts/
  - alguns arquivos de core/ e server/services/ para pegar o estilo dos
    comentários — eles explicam POR QUE cada decisão foi tomada, e o AGENTS.md
    precisa pedir que isso continue.

Além do que estiver escrito nesses arquivos, inclua as regras abaixo. Elas
valem, não estão documentadas em lugar nenhum, e custaram caro para descobrir:

  Dinheiro e unidades
  - Todo valor monetário é inteiro de centavos (core/kernel/money.ts). Nunca
    float. Horas e pontos de cartão são inteiros de milésimos.
  - Quem interpreta texto digitado é o domínio (parseMoney/parseScaled), nunca
    um Number(...).replace() na tela. Um replace(/\D/g,"") num campo decimal
    apaga a vírgula e multiplica o valor por cem, calado.

  Leitura de entrada HTTP
  - Toda rota lê o corpo por server/http/input.ts. O input.done() RECUSA chave
    do corpo que nenhuma leitura tocou — mandar um campo que a rota não lê faz a
    requisição inteira voltar 400, inclusive as corretas.

  Dados reais
  - A produção (Cloudflare Workers + D1) tem o dinheiro real do dono. Nunca
    popular produção com dados de demonstração; o banco sobe vazio e só ganha
    dados pelo uso.
  - Valor que existia antes de o app acompanhar entra como lançamento visível,
    nunca embutido em saldo de abertura.

  Testes
  - `npm test` roda core (node --test), server (contra um SQLite de verdade) e
    mobile. Regra de negócio nova sem teste não entra.
  - `npm run smoke` exercita a pilha inteira contra um servidor rodando. Hoje
    ele tem expectativas ancoradas em datas fixas de agosto/setembro de 2026 e
    falha sozinho quando o calendário passa do fechamento do cartão. Se falhar,
    confira contra um commit anterior antes de culpar a sua mudança.

  Trabalho em worktree
  - Este repositório é usado com git worktrees em .claude/worktrees/. Rode tudo
    a partir da pasta aberta e não saia dela. A pilha de `git stash` é
    compartilhada entre worktrees: prefira um commit temporário a `git stash`.

3. REGISTRE O SERVIDOR MCP

O repositório declara em .mcp.json um servidor MCP do shadcn, iniciado com
`npx shadcn@latest mcp`. Registre o equivalente na configuração do Codex. O
components.json já aponta os aliases deste projeto (componentes em app/ui,
utilitários em core/kernel) e um registro extra chamado @spell em
https://spell.sh/r/{name}.json.

4. DEIXE O AMBIENTE PRONTO

  - Node >= 22.13. Rode `npm ci` na raiz (o mobile é workspace npm, não instale
    separado).
  - Copie .dev.vars.example para .dev.vars se ele ainda não existir.
  - `npm run dev` sobe o site em http://localhost:5173 (Vite + Cloudflare).
  - Publicar exige `wrangler login` e o id real do banco D1; sem ele o build sai
    com um id de espaço reservado e o deploy falha com "database not found":
        CLOUDFLARE_D1_DATABASE_ID=$(npx wrangler d1 list --json \
          | jq -r '.[] | select(.name=="fluxo-pessoal-app") | .uuid') npm run build
        npx wrangler deploy --config dist/server/wrangler.json
  - O APK do Android se gera com `bash scripts/apk-local.sh`. Leia o cabeçalho
    do script: ele precisa de um JDK 17 (do 24 em diante o build morre por causa
    de um aviso da JVM que o Gradle trata como erro) e de um TMPDIR fora de /tmp
    (aqui /tmp é tmpfs com cota e já encheu no meio de um build).

5. COMO EU GOSTO DE TRABALHAR

Coloque isto no AGENTS.md também, porque é sobre o trabalho e não sobre o
código:
  - Execute de ponta a ponta. Não pare entre etapas para pedir aprovação de
    coisa reversível dentro do repositório: instalar dependência, rodar lint,
    rodar teste, subir servidor de desenvolvimento, rodar build. Faça e relate.
  - Não me devolva problema que você mesmo pode resolver. Se o disco encheu,
    limpe; se falta uma variável de ambiente, descubra qual é.
  - Confirme comigo antes de coisa destrutiva ou de efeito externo: apagar dado
    de usuário, publicar, enviar mensagem.
  - Código e comentários em português. Comentário explica POR QUE, não O QUE.
  - Quando eu relatar um defeito, encontre a causa raiz e prove que encontrou —
    reproduza antes de consertar.

6. PORTE OS SKILLS, SE HOUVER ONDE

Na máquina onde o projeto foi tocado até agora existem dez skills do Claude Code
em ~/.claude/skills/ (cada um é um SKILL.md com frontmatter). Se este ambiente
tiver um mecanismo equivalente de prompt reutilizável, converta os que fizerem
sentido para este projeto; se não tiver, não force — resuma no AGENTS.md só o
que muda decisão de código. São eles:

  tdd, react-doctor, react-scan, ui-ux-pro-max, web-design-guidelines,
  redesign-existing-projects, programmatic-seo, caveman, find-skills,
  task-observer

Se a pasta ~/.claude/skills não existir nesta máquina, diga isso e siga — eles
não são necessários para o projeto compilar nem para os testes passarem.

7. NO FIM

Rode `npm ci`, `npm test`, `npm run lint` e um `npm run build`, nessa ordem, e
me diga o que passou. Depois mostre o AGENTS.md que você escreveu para eu
conferir antes de commitar.
```

---

## O que está sendo portado

**Do repositório** (já versionado, o Codex só precisa ler):

| Arquivo | O que é |
| --- | --- |
| `docs/01-regras-de-negocio.md` … `docs/api-v1.md` | as regras e a arquitetura |
| `.mcp.json` | servidor MCP do shadcn |
| `components.json` | aliases do shadcn e o registro `@spell` |
| `.openai/hosting.json` | binding D1 e id do projeto na hospedagem |
| `scripts/apk-local.sh` | build do APK com o JDK certo |
| `.claude/launch.json` | como subir o servidor de desenvolvimento (só o Claude Code lê) |

**Da máquina** (fora do git, e é o que se perde numa troca):

| Onde | O que é |
| --- | --- |
| `~/.claude/skills/` | dez skills de uso geral, nenhum específico do Fluxo |
| `~/.claude/plugins/` | `claude-code-setup` e `cloudflare` (marketplace `cloudflare/skills`) |
| `~/.claude/settings.json` | tema, workflows ligados, notificações |
| `~/.claude/projects/…/memory/` | cinco preferências aprendidas com o dono, resumidas no passo 5 do prompt |

As cinco memórias são a parte que mais importa levar, porque não estão em
documentação nenhuma:

- executar de ponta a ponta, sem pedir aprovação a cada passo;
- produção sobe vazia, nunca com dados de demonstração;
- valor anterior ao app vira lançamento visível, nunca saldo de abertura;
- valor/hora é calculado no relatório, nunca gravado no lançamento;
- o livre para gastar é a caixinha menos a parte dele na fatura, e compra para
  terceiros vai na categoria Empréstimo do Cartão.
