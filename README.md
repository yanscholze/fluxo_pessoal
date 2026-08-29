# Fluxo

Gestão financeira pessoal. Responde uma pergunta que a maioria dos aplicativos
do gênero não responde direito: **quanto você realmente pode gastar hoje**.

Saldo não é isso. Saldo é o que existe na conta agora, e boa parte dele já tem
dono — a fatura que fecha semana que vem, a parcela que vence dia 10, o aluguel.
O Fluxo separa as duas coisas e mostra o que sobra depois de honrar o que já
está assumido.

---

## As cinco grandezas

Elas nunca são somadas nem apresentadas uma como a outra. Confundi-las é o
defeito que este produto existe para corrigir.

| Grandeza | O que é |
| --- | --- |
| **Patrimônio** | Ativos menos dívidas. A foto do todo. |
| **Saldo atual** | Dinheiro que existe agora nas contas. |
| **Comprometido** | Faturas em aberto e contas previstas do ciclo. |
| **Livre para gastar** | Saldo menos comprometido. A resposta. |
| **Fluxo futuro** | Projeção. Nunca apresentada como saldo. |

Duas regras que sustentam o resto:

- **Competência de fatura não é mês civil.** Uma compra em 14/08 num cartão que
  fecha dia 13 pertence à fatura de setembro.
- **Compra no crédito não toca conta nenhuma.** O dinheiro só sai quando a
  fatura é paga — é isso que impede o mesmo gasto ser contado duas vezes.

---

## Como está montado

O razão (*ledger*) é a fonte única de verdade. Um **lançamento** é o fato que o
usuário registra; as **movimentações** são o efeito dele sobre contas e cartões.
Saldo, fatura, patrimônio, comprometido e projeção são todos consultas sobre
movimentações — nunca colunas mantidas por delta.

```
core/      domínio puro: dinheiro, datas, competência, razão, projeção
           não conhece HTTP, banco, React nem localStorage
server/    serviços, repositórios, autenticação, migrações
app/       site (Next.js 16, React 19, Tailwind 4) sobre Cloudflare Workers
mobile/    aplicativo Android (Expo, React Native), offline-first
docs/      regras de negócio e arquitetura
```

`core/` é consumido pelos dois lados: o site importa por caminho relativo, o
aplicativo como pacote `@fluxo/core`. **Uma regra, uma implementação, dois
consumidores** — o celular e o site calculam o mesmo saldo porque executam o
mesmo código, não porque alguém sincronizou duas contas parecidas.

Detalhes em [`docs/02-arquitetura.md`](docs/02-arquitetura.md); as regras de
negócio em [`docs/01-regras-de-negocio.md`](docs/01-regras-de-negocio.md).

---

## Rodar

Requisitos: Node.js `>=22.13.0`. Os scripts de instalação e build usam `flock`,
`curl` e o `timeout` do GNU, e por isso são de Linux.

```bash
npm install
```

```bash
npm run dev
```

O site sobe em `http://localhost:5173`. O banco local é o D1 do Miniflare, e as
migrações são aplicadas na primeira requisição — não há passo separado.

### Conta de demonstração

```bash
npm run seed:demo
```

Popula uma conta pela API real, pelos mesmos caminhos que a interface usa: seis
meses de histórico, dois cartões, parcelamentos com e sem juros, recorrências,
orçamentos, metas, investimentos, uma viagem, capturas de notificação
aguardando revisão e um extrato OFX parado na etapa de revisão.

```
http://localhost:5173/entrar
demo@fluxo.app
demonstracao123
```

### Aplicativo Android

Instruções completas em [`mobile/README.md`](mobile/README.md). O resumo:

```bash
cd mobile && npm run android
```

O aplicativo **não** funciona no Expo Go — o listener de notificações é um
módulo nativo. É preciso um build de desenvolvimento, local ou pela EAS.

---

## Verificação

```bash
npm test
```

Roda os testes de domínio e os do aplicativo. Com o servidor no ar:

```bash
npm run smoke
```

O smoke exercita a pilha inteira — HTTP, autenticação, serviço, domínio, banco —
e confere os números que a tela mostra. Teste de unidade prova que a regra está
certa; este prova que ela chega até a tela.

| Comando | O que faz |
| --- | --- |
| `npm test` | domínio + aplicativo |
| `npm run test:core` | só o domínio |
| `npm run test:server` | só os serviços |
| `npm run test:mobile` | só o aplicativo |
| `npm run smoke` | ponta a ponta contra o servidor rodando |
| `npm run lint` | ESLint |
| `npm run build` | typecheck, build e validação do artefato |
| `npm run db:generate` | gera migração após mudar o schema |

---

## Versão

**0.5.0.** A numeração continua a linha anterior, que parou em 0.4.5, mas o
código não: esta é uma reconstrução do zero. O 0.4.5 sobrevive no branch `main`
publicado e serviu como referência de requisitos, de regras de negócio e de
problemas a não repetir — não como base de código.

Não é 1.0 de propósito. Falta o que está listado abaixo.

### O que ainda falta

- **Migração dos dados da primeira implementação.** As tabelas antigas estão
  preservadas como `legacy_*`. Subir agora abre um aplicativo vazio.
- **Execução do aplicativo em aparelho.** Ele compila, empacota e gera bundle,
  mas nunca rodou num Android de verdade. Três coisas seguem sem confirmação:
  se o listener de notificação recebe, se a interface está bem proporcionada na
  tela real, e se o pareamento fecha o ciclo.
- **Busca global e notificações no site.** O lugar está reservado na casca; não
  foram implementadas, e um campo de busca que não busca é pior que ausência.
- **Widgets do Android.** Saíram junto com os componentes de que dependiam,
  em vez de ficarem apontando para o vazio.

---

## Plataforma

O site roda em Cloudflare Workers via [vinext](https://github.com/cloudflare/vinext),
com D1 e [Drizzle](https://orm.drizzle.team/docs/get-started/d1-new). O
`install:ci` é um `npm ci` único e sem retentativa, que recusa instalação
concorrente para o mesmo projeto, verifica a integridade do tarball do vinext
gravada no `package-lock.json`, limita o npm a um socket e mata instalação
travada. Os prazos são ajustáveis por `SITES_INSTALL_TIMEOUT`,
`SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT` e `SITES_BUILD_KILL_AFTER`.

O repositório é um workspace npm. Isso não é preferência de organização: é o que
a EAS Build usa para detectar o monorepo e enviar `core/` junto no build do
aplicativo. O preço é que o `npm ci` do site também instala as dependências do
Android — o motivo está registrado em `scripts/install-ci.sh`.

O diretório `.sites-runtime/` é descartável e ignorado pelo Git.
