# Fluxo: auditoria do caminho crítico e IA persistida

Revisão local de 27/10/2026. Base inicial: `694aa57`, checkout `main`, inicialmente limpo. Não houve commit, push, deploy, acesso a dados financeiros de produção nem chamada real a provedores nesta revisão.

## 1. Causa encontrada e limites da conclusão

O gargalo demonstrado é a amplificação do processamento financeiro nas leituras, somada ao pré-carregamento especulativo de telas pelo Vinext. **A abertura já fazia zero chamadas Gemini**. Desativar Gemini, portanto, não eliminaria os cálculos, consultas, mapeamentos e escritas repetidos.

Não foi coletado um perfil de CPU da produção. As contagens abaixo foram medidas no mesmo cenário descartável, com SQLite real, driver Drizzle/D1 e serviços reais. São operações SQL, não milissegundos de CPU e nem uma equivalência com subrequests Cloudflare. Os resultados sustentam a correção dos gargalos encontrados; o consumo e o desaparecimento do erro de produção precisam de medição após uma publicação autorizada.

| Operação de serviço, sem consultas extras da autenticação HTTP | Antes | Depois |
| --- | ---: | ---: |
| Leitura da central de notificações, inclusive repetida | 77 | 2 |
| Estado inicial do assistente | 54 | 8 |
| Contexto financeiro completo | 47 | 14 |
| Dashboard + saúde na mesma renderização | 24 | 15 |
| Dashboard financeiro interno, sem projetos e últimos lançamentos | 15 | 9 |

A comparação do contexto antes/depois verificou igualdade de todo o resultado financeiro, insights e fingerprint público legado. A redução de consultas do contexto foi de aproximadamente 70%; ela **não** implica redução medida de 70% da CPU de produção.

## 2. Fluxo anterior rastreado

1. `POST /api/v1/session`: autenticação, PBKDF2 e emissão da sessão. Sem IA, dashboard ou contexto financeiro.
2. Formulário executava `router.replace('/')` e `router.refresh()`, podendo repetir o carregamento.
   O formulário agora também declara `method="post"`: se a hidratação/assets falhar, o navegador não envia credenciais na query string por submissão GET nativa.
3. `/` renderizava `buildAssistantState` → `runFinancialAnalysis(false)` → **montagem de contexto antes de ler o cache**.
4. A montagem chamava dashboard, saúde, relatório de seis meses, metas, parcelamentos e os repositórios novamente. Uma montagem carregava o razão seis vezes, contas/cartões cinco vezes, índice de lançamentos quatro vezes e categorias repetidamente.
5. O Shell consultava `GET /api/v1/alerts` na montagem, a cada troca de caminho, foco, visibilidade e minuto.
6. Esse GET primeiro regenerava notificações determinísticas com outro dashboard, depois reconstruía o contexto completo, reconciliava avisos de análise e só então lia os documentos persistidos.
7. `PATCH /alerts` repetia essa leitura cara; o frontend ignorava o resultado e fazia outro GET.
8. Após o chat, novos GETs de assistente e notificações reconstruíam o mesmo contexto.
9. A sidebar e demais `next/link` permitiam prefetch. No Vinext 0.0.50 instalado, a classificação de prefetch usa o formato do caminho e considera diversas telas autenticadas prefetcháveis, apesar de `force-dynamic`. Visibilidade/hover podiam executar SSR de telas que o usuário não abriu.

`/painel` calculava dashboard e saúde separadamente; seu corpo não dependia do Gemini. `/api/v1/cards` ainda calculava detalhes de projetos, horas e tarefas que não utilizava. Não foi encontrado um N+1 de SQL por lançamento nesses caminhos; havia fan-out fixo recursivo e varreduras repetidas de arrays, incluindo totais de faturas por competência.

## 3. Onde Gemini era e continua sendo chamado

- `POST /api/v1/assistant`: pergunta explícita de chat.
- `POST /api/v1/receipts`: leitura explícita de comprovante.
- Análises automáticas pelo cron existente do Worker.
- Novo `POST /api/v1/assistant/analysis`: botão explícito “Atualizar análise”.

Nenhum GET, login ou navegação gera inferência. Uma operação lógica Gemini pode manter as tentativas de recuperação já existentes do cliente (incluindo fallback de modelo), dentro do timeout compartilhado de 30 segundos. As cotas existentes por usuário/recurso foram preservadas.

## 4. Arquitetura implementada

```text
login → sessão → página essencial
                   ├── dados financeiros determinísticos
                   └── leitura do último insight/notificação persistido

escrita financeira → revisão D1 incrementada atomicamente por gatilho
                   → leitura identifica stale, preservando o último insight
                   → cron ou atualização manual verifica contexto
                   → lease D1 antes de montar contexto
                   → fingerprint semântico igual: reutiliza resultado
                   → fingerprint diferente: provedor interpreta evidências
                   → validação e persistência
                   → frontend lê resultado novo, sem loading global
```

`GET /api/v1/assistant/analysis` faz três leituras pequenas (cache, revisão e lease), excluindo da seleção SQL o snapshot maior de contexto usado pelo chat. `GET /assistant` adiciona configuração, cotas e histórico limitado. `GET/PATCH /alerts` só apresentam/atualizam documentos salvos. Esses caminhos não carregam o razão, não constroem contexto e não reconciliam avisos.

## 5. Revisão barata, fingerprint e cache

`financial_revisions` é um marcador por usuário. Gatilhos cobrem contas, categorias, cartões, lançamentos/razão, faturas, planos, recorrências/baixas, metas/aportes, investimentos/movimentos, orçamentos e capturas. A alteração do marcador ocorre na mesma operação de escrita, inclusive importações e deletes. Ele não é um saldo nem uma regra financeira paralela.

Revisão diferente, mudança de dia civil ou versão de análise indica **necessidade de verificar** o contexto. Não implica uma chamada paga. A decisão final usa SHA-256 de JSON canônico limitado à versão, período/ciclo, totais relevantes e evidências determinísticas efetivamente interpretadas. Objetos têm chaves ordenadas; as evidências têm ordem estável. O simples `asOf`, horário de abertura e expiração de seis horas não invalidam uma análise semanticamente idêntica.

Persistem-se `generated_at`, fingerprints analisado/verificado/publicado, revisão de origem, dia/instante da verificação, sugestões, provedor/modelo efetivo, `analysis_version`, tentativa/erro sanitizado e snapshot financeiro minimizado. Nenhuma credencial é incluída. Snapshots de contexto têm limite de tamanho e permanecem no D1 da própria conta; não são devolvidos no GET de insights.

O payload automático deixou de duplicar contexto inteiro, histórico, métodos e escopos estáticos junto das evidências. O provedor só explica evidências existentes; valores, fatos, prioridades e cálculos continuam determinísticos.

## 6. Stale, falhas e atualização manual

- Leitura retorna imediatamente o último insight válido, mesmo stale ou durante geração.
- Estados aditivos: `empty`, `ready`, `stale`, `updating`, `error`; data da geração permanece a do resultado exibido.
- Falha de rede, quota, credencial, JSON ou schema mantém o último resultado pronto e aplica recuo de uma hora.
- Sem resultado anterior, ficam disponíveis fatos determinísticos/estado vazio apropriado; a aplicação essencial continua funcionando.
- Clicar repetidamente em atualização não gera novas chamadas se a versão atual ou o hash semântico já foi analisado.
- O frontend usa loading/erro local ao componente de IA. Quando stale/vazio, consulta somente o GET barato a cada 60 segundos em primeiro plano; durante geração, a cada 15 segundos; quando fresco, para. Nunca solicita geração por polling/montagem.

## 7. Concorrência e consistência

O lease existente em D1, único por usuário/escopo, agora é adquirido **antes** de construir contexto. Impede trabalho pesado e inferências concorrentes entre isolates; expira em 90 segundos e tem escopos separados para chat, análise e notificações.

A revisão é lida antes/depois da montagem. Escrita concorrente deixa o resultado stale; uma mudança durante Gemini também é identificada antes de publicar notificações dessa análise. Uma nova verificação retoma os dados atuais. Falhas de publicação são recuperáveis pelo fingerprint de publicação sem refazer Gemini.

As leituras compartilhadas usam `withFinancialReadScope`, um escopo explícito AsyncLocalStorage só de leitura. Compartilha promises e resultados mapeados por usuário/opções durante uma operação, libera ao terminar e remove promises rejeitadas. Não é cache global, não atravessa requisições e não envolve mutações. Os testes verificam isolamento, concorrência e leitura nova após escrita.

## 8. Notificações e trabalho agendado

Avisos objetivos de fatura, atraso, compromisso, captura e margem continuam determinísticos. Reconciliação por `eventKey` mantém deduplicação, lidas, revisão e histórico. Avisos inteligentes continuam separados e não repetem o mesmo vencimento.

`notification_checkpoints` permite pular reconciliação se revisão e dia não mudaram. O mesmo cron do Worker agora executa a cada cinco minutos e processa **uma conta por execução**, pela verificação mais antiga, independentemente da data de geração. Isso limita trabalho por invocação e impede que cinco contas antigas monopolizem a rotação.

Falha nos avisos determinísticos não impede tentativa da análise; falha de IA não impede os avisos determinísticos. GETs e mutações não ganham processamento caro escondido em `waitUntil`: ele ainda consumiria o orçamento da mesma invocação.

**Latência explícita:** com N contas e cron saudável, a rotação normalmente verifica cada uma em até cerca de `5 × N` minutos. O insight anterior/avisos persistidos ficam visíveis nesse intervalo. Erros, leases ocupados, recuo ou atraso do cron podem ampliar essa janela. Esse desenho privilegia abertura barata, não atualização determinística instantânea após cada escrita. Não foi criada fila, microsserviço ou infraestrutura paralela.

## 9. Chat preservado e separado

Perguntas continuam chamando o provedor explicitamente, com histórico limitado às últimas 12 mensagens e saída validada. Não regeneram análises automáticas. Um snapshot só é reutilizado quando revisão, dia e versão são atuais; perguntas que exigem detalhe reconstruem o contexto atual. Simulações continuam sendo cálculos determinísticos do Fluxo. Cotas, leases e erros de chat são independentes da geração automática.

## 10. Instrumentação

`Server-Timing` registra agregados de autenticação, banco, contexto financeiro, IA, notificações, serialização JSON e tempo até a resposta. `db_queries` conta statements SQL, incluindo statements de batch; não representa necessariamente chamadas de rede D1.

São tempos de parede, **não CPU time**. Estágios concorrentes/nested podem somar mais que o total. No SSR com streaming, o total do header não mede o consumo completo posterior do stream. API JSON é a medição mais direta. Não se guarda SQL, parâmetros, URL com query, IDs de conta, prompts ou dados privados nos logs. Requisições comuns ficam silenciosas; requisições lentas/com erro e falhas agendadas emitem códigos/contagens/tempos, método HTTP e área de rota de uma lista fixa (IDs substituídos por `:item`).

## 11. Banco e compatibilidade

- `0028_persisted-financial-intelligence.sql`: colunas aditivas de metadados/snapshot em `ai_analyses`, revisão por usuário e gatilhos.
- `0029_notification-checkpoints.sql`: checkpoint independente de avisos determinísticos.
- Diário do migrator atualizado para 30 migrations; registros existentes de análise permanecem intactos e serão revalidados pela nova versão.
- Gatilhos verificam a existência do usuário, permitindo exclusão em cascata sem ressuscitar revisões órfãs.
- Sem exclusão/recriação de dados financeiros, alteração de fórmula do Livre, troca de stack, mudança de ID D1 ou nova infraestrutura.
- As migrations só foram aplicadas em bancos descartáveis nesta tarefa. A primeira aplicação em produção e a nova frequência do cron exigem publicação posterior, não realizada aqui.

## 12. Arquivos principais

| Área | Arquivos |
| --- | --- |
| Análise/contexto/chat | `server/services/ai/{analysis,assistant-state,financial-context,coach,client}.ts` e testes |
| Persistência | `server/repositories/ai.ts`, schemas IA/checkpoints, migrations 0028/0029, migrator e testes |
| Leituras financeiras compartilhadas | `server/services/financial-read-scope.ts`, testes, repositórios catalog/ledger/recurrences |
| Financeiro essencial | `server/services/dashboard.ts`, `/painel/page.tsx`, API cards |
| Notificações | `server/services/{notifications,notification-refresh}.ts`, testes, UI notification-center |
| API | `app/api/v1/assistant/analysis/route.ts`, session (medição) |
| Web | assistant-chat, contracts, access-form; `prefetch={false}` nos Links autenticados compartilhados e telas financeiras |
| Mobile | `mobile/src/screens/assistente.tsx`, `mobile/src/net/views.ts` |
| Instrumentação | `server/observability/request-metrics.ts` e testes, db/client, auth/session, http/respond, worker/index |
| Cron/validação | `vite.config.ts`, `scripts/validate-ai-critical-path.mjs`, `package.json` |

## 13. Validação e resultados

```sh
npm test
npm run lint
npm run build
npm --workspace mobile run typecheck
npm run check:secrets
npm run validate:ai-scheduled
npm run validate:ai-critical-path
```

- Suíte completa: **883 testes aprovados** (566 core, 285 servidor, 27 mobile, 5 proteção de segredos).
- TypeScript web/mobile, ESLint completo e build do Worker aprovados.
- Testes novos cobrem A–J do pedido: login/dashboard offline; GET persistido sem inferência/contexto; estabilidade sem TTL; stale preservado; falha/backoff; duas chamadas concorrentes; avisos independentes; chat separado; respostas/logs sanitizados; isolamento entre contas e corrida com escrita financeira.
- Testes de migrations e gatilhos aprovados em SQLite/D1 descartável; razão e totais preservados.
- `validate:ai-critical-path` usa o Worker realmente compilado, D1 efêmero, autenticação real e mock local da API Gemini. Verifica abertura/reloads sem modelo, atualização manual, cache, stale, falha, cooldown, login/dashboard/cartões offline, chat e cron sem criar lançamentos.
- `validate:ai-scheduled` também aprovado: Worker agendado real, nenhuma chave/modelo real e lançamentos inalterados.
- React Doctor: 70/100 sem regressão de pontuação; permanecem diagnósticos prévios de complexidade da central, lookup no contexto e refs/value do provider mobile. A refatoração não pretende limpar problemas não relacionados.
- A validação visual usa exclusivamente conta e D1 descartáveis. O mock de provedor evita consumo pago e exposição de dados reais.
- Navegador, build de produção local: login concluído; navegação em Painel, Lançamentos, Contas, Cartões, Compromissos, Relatórios e Projetos com o mock Gemini offline; três recargas da Home mantiveram o insight salvo. O contador de inferências permaneceu em quatro desde a única atualização manual anterior, até solicitar explicitamente a atualização depois de outra alteração.
- Uma despesa fictícia registrada pelo formulário alterou a situação financeira e marcou a análise stale sem apagar o texto anterior. Atualização com mock offline mostrou erro/cooldown local e preservou o insight. Atualização online anterior exibiu o novo resultado; um segundo clique com contexto idêntico não chamou o modelo novamente.
- Temas claro/escuro conferidos, preferência persistiu na navegação; nenhuma rolagem horizontal no viewport desktop de 1.270 px. Nenhum erro de console do servidor final de validação. O primeiro harness local teve roteamento de assets incompleto, corrigido no próprio script de teste, sem mudança de infraestrutura da aplicação.
- Capturas locais: `outputs/cpu-audit/insight-persistido.jpg`, `insight-stale.jpg`, `insight-offline.jpg` e `insight-offline-claro.jpg` (artefatos ignorados pelo Git).

## 14. Limitações para a revisão

Ainda não existe medição de CPU de produção após esta mudança porque não houve deploy. Histórico muito grande continua exigindo a montagem determinística completa quando uma análise/chat realmente precisa dele; reduzir consultas repetidas não torna esse trabalho gratuito. O plano/orçamento real de CPU deve ser observado depois da publicação, sem pressupor que um teste local garante o limite remoto.

O desenho mantém os últimos insights e isola as falhas do provedor, mas uma indisponibilidade do próprio D1 continua afetando recursos essenciais que precisam do banco. APK/RPM e teste físico Android não foram pedidos nem gerados nesta etapa.
