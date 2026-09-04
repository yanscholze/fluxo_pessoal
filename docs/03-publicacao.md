# Fluxo — publicação

Como colocar no ar. Dois destinos independentes: o site, num Worker da
Cloudflare, e o aplicativo, pela EAS.

Nenhum dos dois roda sem credencial, e nenhuma credencial mora neste
repositório. Quem publica autentica na própria máquina.

---

## 1. Site — Worker `fluxo-pessoal`

### Antes da primeira vez

O nome do Worker já vem certo: `vinext build` gera
`dist/server/wrangler.json` com `"name": "fluxo-pessoal"`. O que **não** vem
certo é o banco.

```
"d1_databases": [{ "binding": "DB", "database_id": "00000000-0000-4000-8000-000000000000" }]
```

Esse identificador é um marcador de posição. Ele só resolve quando o painel do
Sites injeta os bindings no momento do deploy — publicando direto na sua conta
da Cloudflare, ele não resolve, e o Worker sobe com o `DB` apontando para
lugar nenhum. O sintoma é toda rota respondendo erro de binding indisponível.

Descubra o identificador real:

```bash
npx wrangler d1 list
```

Se ainda não existe um banco, crie:

```bash
npx wrangler d1 create fluxo-pessoal
```

### Publicar

```bash
export CLOUDFLARE_API_TOKEN='...'
export CLOUDFLARE_D1_DATABASE_ID='...'
npm run build
npx wrangler deploy --config dist/server/wrangler.json
```

O `CLOUDFLARE_D1_DATABASE_ID` precisa estar definido **no build**, não só no
deploy: é o `vite.config.ts` que o escreve no `wrangler.json` gerado.

O token precisa de permissão de edição em Workers e em D1. Em máquina pessoal,
`npx wrangler login` faz o mesmo por navegador e dispensa o token.

### Segredos opcionais

Nada disso é obrigatório: sem qualquer um deles o Fluxo sobe e funciona, apenas
com o recurso correspondente desligado e dizendo isso na tela.

```bash
npx wrangler secret put OPENAI_API_KEY --config dist/server/wrangler.json
npx wrangler secret put GITHUB_TOKEN --config dist/server/wrangler.json
```

| Segredo | Liga | Permissão mínima |
| --- | --- | --- |
| `OPENAI_API_KEY` | Assistente e leitura de comprovante | — |
| `GITHUB_TOKEN` | Lista de repositórios para vincular, commits, PRs e issues | leitura: Contents, Issues, Pull requests |

No desenvolvimento local os mesmos segredos vão em `.dev.vars` na raiz — o
Wrangler o lê e expõe cada linha como `env.NOME`, o mesmo caminho do
`wrangler secret put`. Há um `.dev.vars.example` para copiar; `.dev.vars` é
ignorado pelo git.

A aba **Integrações**, em Configurações, mostra se cada segredo pegou. Sem ela,
quem acabou de configurar descobre pelo silêncio — e não sabe se o token está
errado, ausente ou sem permissão.

Segredo do Worker, **nunca** coluna no banco. O Fluxo guarda dado financeiro de
uma pessoa; um vazamento dele não pode virar acesso de escrita ao código de
todos os clientes dela. Pelo mesmo motivo a ficha do projeto guarda onde a
senha do painel está — "1Password, cofre Clientes" — e não a senha.

O token do GitHub é usado só para ler. Nenhuma rota do Fluxo abre issue,
comenta ou faz merge.

### Depois de publicar

As migrations são aplicadas na primeira requisição depois do deploy — há um
diário em `_migrations`, cada uma roda uma vez e em ordem, e o resultado é
memoizado por isolate. Não existe passo manual. Ver `server/db/migrator.ts`.

Confira que subiu:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://<seu-dominio>/entrar
```

Deve responder `200`. Uma rota protegida sem sessão deve responder `307` para
`/entrar`.

---

## 2. Aplicativo Android — EAS

### Antes da primeira vez

```bash
npm install -g eas-cli
eas login
```

Em automação, `EXPO_TOKEN` substitui o login interativo.

### Gerar o pacote

```bash
cd mobile
eas build --platform android --profile production
```

Os perfis estão em `mobile/eas.json`:

| Perfil | Saída | Para quê |
| --- | --- | --- |
| `development` | APK com dev-client | Desenvolver com recarga |
| `preview` | APK | Instalar direto no aparelho |
| `production` | AAB, versão automática | Publicar na loja |

Para instalar no seu aparelho sem passar pela loja, `preview` é o perfil: gera
APK, que o Android instala direto.

### O que a EAS precisa saber

O repositório é um workspace npm, e isso não é preferência de organização: é o
que faz a EAS detectar o monorepo e enviar `core/` junto no pacote. Sem o campo
`workspaces` no `package.json` da raiz, ela empacotaria só `mobile/`, e o
`npm install` no servidor dela quebraria — porque `@fluxo/core` mora fora
daquela pasta.

O preço é que o `npm ci` do site também instala as dependências do Android:
cerca de 420 pacotes que ele não usa. Entre duplicar o domínio e engordar um
instalador, engordar o instalador é o mal menor.

---

## 3. O que não é publicado

Keystore, token, credencial e segredo nunca entram no repositório. O
`.gitignore` recusa `*.keystore`, `*.jks`, `.env*` e `google-services.json`.

A senha de nenhum projeto é guardada pelo Fluxo — nem a do usuário, nem a dos
clientes na área de trabalho. O campo que existe lá aponta **onde** a
credencial está, e o motivo está em `server/db/schema/dev.ts`.
