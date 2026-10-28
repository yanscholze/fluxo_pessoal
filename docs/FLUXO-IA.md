# Fluxo IA — implementação e validação

Atualização de arquitetura em 27/10/2026: veja [auditoria de CPU e IA persistida](CPU-IA-AUDITORIA.md) para medições, novas migrations, cache semântico, caminho crítico e validação local. As evidências de entrega inicial abaixo são históricas.

Esta entrega substitui a interface TARS dentro do Fluxo por uma conversa financeira integrada. O projeto independente TARS não é alterado. Nenhuma regra do Livre para gastar foi substituída. Não foram feitos commit, push ou deploy nesta tarefa.

## 1. Arquitetura encontrada

| Área | Implementação existente preservada |
| --- | --- |
| Web e desktop | React 19, rotas App Router/Next, vinext/Vite, componentes e temas próprios; desktop utiliza a mesma aplicação web |
| Android | React Native 0.86 / Expo 57, telas nativas, navegação própria, API HTTP e sessão no SecureStore |
| Backend | Rotas `app/api/v1`, serviços em `server/services`, repositórios Drizzle, Worker Cloudflare existente |
| Banco e autenticação | D1/SQLite, migrations versionadas, usuários e sessões web/dispositivo isoladas; cookie HttpOnly e tokens de sessão com hash |
| Finanças | Lançamentos, movimentos contábeis, receitas/despesas, contas, categorias, cartões/faturas, parcelamentos, recorrências, metas, reservas, relatórios e projetos existentes |
| Cálculos | `dashboard`, `reports`, `health`, `installments`, `goals` e funções puras de `core`; algumas métricas têm escopos diferentes, portanto não podem ser somadas indiscriminadamente |
| IA anterior | Gemini/OpenAI, chave pessoal cifrada por conta, quotas, leitura de cupom e pergunta isolada; contexto enviava até 120 lançamentos com descrições por padrão |
| Avisos anteriores | Regras determinísticas e entrega local Android; sem central web com leitura persistente por conta |

A auditoria precedeu as alterações. Não foi criado um backend paralelo.

## 2. Arquitetura implementada

`Serviços financeiros existentes → contexto agregado e cálculos → insights com evidências → provider opcional → conversa e central de notificações`.

O cliente nunca chama o Gemini diretamente. A IA não recebe ferramentas para criar, editar, excluir ou confirmar lançamentos. Leitura de cupom continua disponível em seção expansível, com revisão humana antes de registrar.

## 3. Arquivos principais

- Contexto/cálculos: `server/services/ai/financial-context.ts`, `insights.ts` e testes correspondentes.
- Provider/conversa: `server/services/ai/client.ts`, `coach.ts`, `assistant-state.ts`, `analysis.ts`, `quota.ts` e testes.
- Persistência: `server/repositories/ai.ts`, schema `ai-conversations.ts`, migration `0026_ai-conversations.sql`.
- Notificações: `server/services/notifications.ts`, `server/repositories/notifications.ts`, schema/migration `0027_notifications.sql` e testes.
- APIs: `/api/v1/assistant` e `/api/v1/alerts`.
- Web: `app/(painel)/page.tsx`, `assistente/assistant-chat.tsx`, `app/ui/ai/*`, shell, navegação, configurações e remoção dos componentes visuais TARS sem importadores.
- Android: chat, central, sino da Home, provider de avisos, entrega/listeners, sessão, navegação e configuração de timeout específico para IA.
- Integração: `worker/index.ts`, `vite.config.ts`, migrator/schema index, `.dev.vars.example`.

## 4. Gemini e abstração

`AIProvider.generate` mantém o restante da aplicação independente do fornecedor. O adaptador Gemini usa REST `generateContent`, `x-goog-api-key` no header, `systemInstruction`, histórico com papéis `user/model` e saída JSON por schema. A resposta também é validada no backend, incluindo limites de tamanho e ações.

O modelo padrão é `gemini-3.8-flash`, configurável por `GEMINI_MODEL`; uma indisponibilidade 503 permite recuo e alternativa `gemini-3.6-flash`. Modelo não encontrado também tenta a alternativa. O orçamento de rede compartilhado entre as tentativas é de 30 segundos. OpenAI permanece disponível para contas que já o selecionaram, com `store: false`.

Documentação oficial consultada: [geração de texto](https://ai.google.dev/gemini-api/docs/generate-content/text-generation) e [respostas estruturadas](https://ai.google.dev/gemini-api/docs/generate-content/structured-output). A API Generate Content continua compatível com a integração REST existente; a documentação a identifica como API legada em relação às novas APIs do fornecedor.

## 5. Configuração segura da chave

**Preferência para uso de várias pessoas:** cada pessoa entra em sua conta e cadastra a chave em **Configurações → Integrações → Gemini**. O backend cifra a credencial com AES-GCM, vinculando usuário e provedor. A interface recebe somente o estado da integração.

**Configuração por ambiente:** copie `.dev.vars.example` para `.dev.vars`, que é ignorado pelo Git, e preencha privadamente:

```dotenv
INTEGRATION_ENCRYPTION_KEY=
GEMINI_API_KEY=
GEMINI_USER_ID=
GEMINI_MODEL=gemini-3.8-flash
```

`GEMINI_USER_ID` deve ser o ID exato da conta proprietária da chave. Sem esse escopo, `GEMINI_API_KEY` não é usada. Uma chave pessoal cadastrada tem precedência. A conta de outra pessoa nunca herda a chave de ambiente.

Em produção, configure essas variáveis/secrets no **Worker existente**, pelo painel Cloudflare. Não use prefixos `VITE_`/`NEXT_PUBLIC_`, arquivos públicos ou bundles mobile. Preserve o valor atual de `INTEGRATION_ENCRYPTION_KEY`: trocá-lo impede decifrar as credenciais pessoais já salvas. Nenhuma chave real foi criada, solicitada ou consumida nesta validação.

## 6. Contexto financeiro e recomendação de reserva

O DTO inclui ciclo canônico, separação V.A/dinheiro, posição, mês, histórico agregado, categorias/tendências, cartões com rótulos genéricos, vencimentos completos antes do corte visual, parcelas, metas e reserva. Totais e percentuais são calculados pelo Fluxo.

- Livre para gastar é o resultado existente de `buildDashboard`; suas flags de exclusão continuam valendo.
- Pagamentos de fatura e transferências não viram despesas de consumo.
- Dívida realizada, faturas brutas e parcelas futuras são identificadas separadamente; parcelas podem já estar nas faturas e não podem ser somadas novamente.
- Não existe uma estimativa inventada de empréstimos externos ausentes do cadastro.
- Não são enviados nomes de contas/bancos/cartões/pessoas, IDs internos, notas ou descrições de lançamentos por padrão. Labels financeiros passam por minimização.
- Perguntas que exigem detalhes recebem no máximo dez movimentos pertinentes, somente data, valor, tipo, categoria e origem genérica.
- Aporte prudente usa margem em dinheiro, liquidez após próximos vencimentos, histórico de meses completos, colchão de gastos recentes, atrasos e projeções. V.A não é dinheiro para aporte. Histórico insuficiente retorna motivo explícito, sem porcentagem universal.
- Simulações de aportes e prazo são matemáticas, sem juros/retorno presumido. Follow-up como “e se guardar só 400?” reaproveita horizonte explicitamente informado nas últimas perguntas.

## 7. Chat e memória

Home e rota `/assistente` continuam acessíveis. O usuário tem sugestões contextuais, poucas evidências, histórico, nova conversa e exclusão explícita de conversa. A pergunta originada de uma notificação é preenchida, nunca enviada automaticamente.

Cada conversa pertence a um usuário. O backend carrega e valida seus IDs; histórico arbitrário enviado pelo cliente é recusado. São enviadas no máximo 12 mensagens anteriores e persistidas no máximo 100 por conversa; a lista mostra as 30 conversas mais recentes. O turno pergunta/resposta é gravado atomicamente após resposta válida. Falhas preservam a pergunta na interface. Documentos pessoais, emails e padrões conhecidos de credenciais em mensagens são minimizados antes do envio e da persistência.

A memória é da conversa, não uma promessa de lembrança ilimitada entre conversas diferentes. O contexto financeiro atual prevalece sobre uma resposta antiga.

## 8. Insights e periodicidade

O motor determinístico identifica riscos de ciclo, atrasos, próximos vencimentos, crescimento/redução de categoria, margem de reserva e déficit futuro. Faturas usam a data congelada já registrada, mesmo após mudanças na configuração do cartão. Sugestões derivam desses fatos. O Gemini pode acrescentar uma explicação qualitativa para até três evidências existentes; não pode criar valores/eventos, mudar prioridades ou remover alertas urgentes. Explicações com números, links ou referências a segredos são recusadas; os valores continuam no texto calculado pelo sistema.

O Worker existente possui handler `scheduled` e cron `*/5 * * * *`: uma conta por execução, em rotação pela verificação mais antiga. A revisão de dados indica necessidade de verificar; o fingerprint semântico decide se realmente é necessária outra inferência. Um resultado pronto não expira por TTL. Instalações maiores precisam rever o tempo de rotação antes de ampliar esse lote.

Abrir o chat, a central ou atualizar componentes **não chama o modelo nem reconstrói fatos financeiros**. Esses caminhos leem resultados persistidos. Análises pagas vêm do cron ou da ação explícita “Atualizar análise”; o chat chama o modelo somente após envio de pergunta. Falhas mantêm o último resultado válido. A mudança de cron e as migrations desta revisão só chegam à produção após publicação autorizada.

## 9. Nova central de notificações

Categorias: crítica, atenção, insight, oportunidade e lembrete. A central tem badge numérico, prioridade, timestamps, filtros, histórico resolvido e ações para o recurso correspondente ou para IA. Mostra até 100 registros, trazendo ativos não lidos antes dos lidos para que novos avisos continuem acessíveis mesmo após ler a primeira centena; o contador de não lidos é calculado em toda a conta.

Faturas são identificadas por cartão e competência, usando vencimentos congelados quando existentes. Previsões e recorrências são consideradas sem depender da agenda resumida. Parcelas já contidas na fatura não produzem uma segunda cobrança no alerta. V.A não é tratado como saldo que paga fatura.

## 10. Estado de leitura

GET, abertura da central e refresh não leem avisos. PATCH marca IDs específicos ou todos os ativos. Ver detalhes/Perguntar à IA/toque em aviso nativo são interações explícitas. Leitura fica no banco e persiste entre dispositivos e recargas. Resolver uma obrigação preserva o histórico e não inventa uma leitura. A UI não chama uma notificação resolvida de “Lida” sem esse registro.

## 11. Deduplicação e cache

- Índice único por usuário/evento; o mesmo aviso é atualizado.
- Escala aproximada 7/3/1 dias aumenta prioridade/revisão; só uma prioridade maior reabre leitura. Mudança diária de texto/valor não dispara novo aviso.
- Capturas usam episódio pendente, sem chave nova a cada dia.
- Entrega Android separada por usuário e servidor, lembrando ID+revisão; leitura continua sendo autoridade do backend.
- Fingerprint SHA-256 semântico por conta, resultado pronto sem expiração por TTL e recuo de uma hora após falha. Revisão/dia indicam verificação pendente, preservando o resultado anterior.
- Lease no banco evita concorrência entre isolates; cache e histórico são relidos após obter o lease.
- Quota atômica diária separada: 60 conversas, 30 leituras de cupom e quatro análises automáticas por conta. Erros de provedor contam para evitar ciclos caros; ausência de chave não consome cota.
- Snapshots antigos não sobrescrevem notificações com fatos mais recentes.

## 12. Falhas e isolamento

Chave ausente, 429, timeout, indisponibilidade, HTTP/JSON inválido ou schema inválido afetam apenas a função IA. Avisos essenciais, finanças e interface não dependem do Gemini. O cron continua para outras contas após uma falha individual. Respostas de erro não incluem corpo do provedor nem tokens; logs do provider registram somente serviço/status.

## 13. Testes e verificação

Os testes usam SQLite real em memória e `fetch` simulado. Nenhuma chamada foi feita à API real.

- Contexto: Livre canônico, exclusões, V.A/reserva, recorrência confirmada, dívida sem duplicidade, vencimentos não truncados, minimização, isolamento e simulação sequencial.
- Provider/chat: segredo fora do payload, chave de ambiente com dono, precedência pessoal, schemas, modelo alternativo, imagens, quota, falhas, memória limitada, histórico persistido/excluído e autenticação.
- Análises: cache, mudança de fingerprint, recuo, lease, evidências inválidas, fallback e execução do serviço agendado.
- Notificações: leitura persistente, contador completo, duas faturas com mesmo vencimento, escalada, resolução, snapshots antigos e ausência de dependência Gemini.
- **Resultado final: 855 testes passaram (566 core, 262 servidor, 27 mobile), zero falhas.** TypeScript web/mobile e ESLint dos arquivos alterados passaram; React Doctor não encontrou diagnósticos nos arquivos alterados. A build web e a validação do artefato passaram. O export Android compilou 4.408 módulos, bundle Hermes de 9,8 MB e 19 assets, sem erros.
- `npm run validate:ai-scheduled` passou com o Worker real empacotado e D1 efêmero: migrations, detecção, cache/fallback, cota não consumida e lançamentos inalterados. O script não carrega secrets do projeto.
- O endpoint de teste do Wrangler com assets retornou `exception` antes de chegar ao handler: reproduzimos o [problema no proxy local de assets registrado pelo Cloudflare](https://github.com/cloudflare/workers-sdk/issues/9882). A validação usa Miniflare direto no mesmo Worker, sem alterar o roteamento de produção.
- Navegador local com conta descartável autorizada: abertura da central mantém leitura; ação para IA preenche contexto sem enviar; leitura persiste após refresh. Tema claro/escuro, persistência e ausência de overflow horizontal conferidos em viewports CSS de aproximadamente 300 a 1.231 px, sem erros relevantes no console. A conta descartável foi removida após a validação.

## 14. Limitações reais

- Não houve chamada Gemini real; credencial/permissões/quota do fornecedor devem ser verificadas pelo proprietário na primeira consulta real.
- Nenhum deploy, commit ou push foi realizado; a produção continua com a versão anterior.
- Android foi validado por testes/tipos/export. Não houve instalação em aparelho nem geração de APK nesta tarefa.
- Notificações Android são locais: atualizam no primeiro plano/retorno ao app, com polling de dois minutos. Não há novo FCM/push remoto ou execução contínua em segundo plano.
- Cron foi implementado e tanto seu serviço quanto o handler empacotado foram testados localmente; não se afirma execução real na Cloudflare antes de publicação.
- Perfil inicial de reserva é conservador; perfis configuráveis e descontos/juros de antecipação não são inventados.
- O contexto reutiliza vários serviços completos e custa dezenas de leituras D1 por montagem. O lote do cron foi limitado; snapshot compartilhado e fila são evoluções adequadas para crescimento.
- IA pode interpretar mal informações mesmo com contexto e schema. Nenhum texto de modelo pode executar alterações financeiras.

## 15. Próximos passos

1. Revisar o diff e autorizar publicação quando desejado; aplicar as migrations pelo fluxo existente da aplicação.
2. Conferir a primeira consulta real com a chave pessoal do Gemini e observar status/quota sem registrar segredos.
3. Validar uma build instalada Android, permissões e navegação de notificações em aparelho real.
4. Para notificações com app fechado, planejar push remoto e consentimento próprios; não confundir polling com entrega em segundo plano.
5. Medir consumo D1/latência antes de ampliar o cron; evoluir snapshot/fila e perfis de reserva sem alterar o cálculo canônico do Livre.
