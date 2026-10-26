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

Roda os testes de domínio, servidor, aplicativo e proteção contra segredos no fonte. Com o servidor no ar:

```bash
npm run smoke
```

O smoke exercita a pilha inteira — HTTP, autenticação, serviço, domínio, banco —
e confere os números que a tela mostra. Teste de unidade prova que a regra está
certa; este prova que ela chega até a tela.

| Comando | O que faz |
| --- | --- |
| `npm test` | domínio + servidor + aplicativo + checagem de segredos |
| `npm run test:core` | só o domínio |
| `npm run test:server` | só os serviços |
| `npm run test:mobile` | só o aplicativo |
| `npm run smoke` | ponta a ponta contra o servidor rodando |
| `npm run lint` | ESLint |
| `npm run check:secrets` | formatos de credenciais no fonte, sem exibir valores |
| `npm run validate:ai-scheduled` | Worker agendado com banco descartável, sem IA real |
| `npm run build` | typecheck, build e validação do artefato |
| `npm run db:generate` | gera migração após mudar o schema |

---

## Versão

A versão web declarada no pacote é **0.5.0**. Android e RPM possuem manifests e numerações próprios; uma release deve registrar as versões efetivamente geradas. O legado anterior permanece identificado pela tag `v0.4.5-legado`.

A `main` é a linha estável. A evolução de IA está na etapa `ai_service`, até sua integração por PR. As regras de branches, issues, CI, releases e deploy estão em [CONTRIBUTING.md](CONTRIBUTING.md); orientações para credenciais e vulnerabilidades em [SECURITY.md](SECURITY.md).

### Fluxo IA e notificações

Chat contextual e histórico por conta, contexto financeiro determinístico, insights com cache e central web/mobile com leitura persistente estão implementados. Configure o provedor em **Configurações → Integrações**. Detalhes de configuração, privacidade, validação e limitações estão em [docs/FLUXO-IA.md](docs/FLUXO-IA.md).

### Limites que exigem validação específica

- Testes e export Android não substituem a verificação em aparelho da versão efetivamente instalada.
- Avisos nativos atualizam no primeiro plano/retorno ao aplicativo; não há promessa de push remoto com o app fechado.
- Migrações/importações de dados reais exigem os procedimentos próprios e não são executadas pelo CI.
- Widgets Android seguem como evolução separada.

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
