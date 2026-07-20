# Fluxo Pessoal

O Fluxo é um assistente financeiro pessoal pensado para transformar dados em decisões. O projeto reúne uma aplicação Web para configuração e administração e um aplicativo Android para o uso financeiro diário.

## Estado atual

- Dashboard financeiro responsivo, com temas claro e escuro.
- Contas, cartões, faturas, compras, parcelas, recorrências, reservas e planejamento.
- Importação de faturas e extratos, além da base de OCR para leitura de cupons.
- Autenticação própria com isolamento dos dados por usuário.
- Sincronização entre Web e Android.
- Assistente financeiro na Home, com dicas contextuais e perguntas sobre os dados do usuário.
- Perfil com foto, nome, alteração de senha, exportação de dados e recomendações.
- Caixa de sugestões para a conta desenvolvedora.

O build público do Android ainda não foi gerado. Antes de cada envio para o Expo/EAS, as funcionalidades devem ser validadas manualmente na Web e no ambiente de desenvolvimento mobile.

## Arquitetura

| Caminho | Responsabilidade |
| --- | --- |
| `app/` | Interface Web e rotas HTTP da API |
| `app/api/v1/` | Autenticação, sincronização, perfil, IA e OCR |
| `lib/` | Regras financeiras, importação, recompensas, calendário e autenticação |
| `db/` | Schema Drizzle e acesso ao banco D1 |
| `drizzle/` | Migrações versionadas do banco |
| `mobile/` | Aplicativo Android em Expo/React Native |
| `tests/` | Testes de regras e contratos da Web/API |
| `docs/` | Documentação técnica complementar |

## Tecnologias

- Next.js 16, React 19 e TypeScript
- Vinext/Vite sobre Cloudflare Workers
- Cloudflare D1 com Drizzle ORM
- Expo 57 e React Native para Android
- OpenAI Responses API no backend para os recursos de IA

## Desenvolvimento Web

Requisitos: Node.js 22.13 ou mais recente e npm.

```bash
npm ci
npm run dev
```

Comandos principais:

```bash
npm run lint
npm run build
npm run test:imports
npm run test:rewards
npm run test:layout
npm run test:mobile-auth
npm run test:sync
npm run test:theme
npm run test:ocr
```

As credenciais, a chave da OpenAI e os bindings do banco não fazem parte do repositório. Eles devem ser configurados como secrets no ambiente de hospedagem.

## Desenvolvimento Android

```bash
cd mobile
npm ci
npm run typecheck
npm test
npm start
```

O app utiliza armazenamento local seguro e sincronização autenticada com a API. A publicação por EAS só deve ocorrer após a validação funcional solicitada pelo responsável pelo projeto.

## Segurança dos dados

Cada registro financeiro é associado ao identificador do proprietário. As rotas protegidas resolvem a sessão no servidor e não aceitam um proprietário arbitrário enviado pelo cliente. Alterar a senha revoga as sessões Web e os dispositivos móveis autorizados.

Não envie tokens, senhas, arquivos `.env` ou chaves de API para o GitHub.
