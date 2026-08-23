# Fluxo — Arquitetura

Decisões da reconstrução. Este documento é normativo: código que o contradiz
está errado.

---

## 1. Camadas

```
        web (app/)              mobile (mobile/)
             │                        │
             └────────┬───────────────┘
                      │  consomem a mesma API e o mesmo domínio
             ┌────────┴────────┐
             │   core/         │  domínio puro — sem React, sem banco, sem rede
             └────────┬────────┘
                      │
             ┌────────┴────────┐
             │   server/       │  casos de uso + persistência (só no Worker)
             └────────┬────────┘
                      │
                  Cloudflare D1
```

| Pasta | Responsabilidade | Pode importar |
| --- | --- | --- |
| `core/` | Tipos do domínio, cálculo financeiro, calendário, dinheiro, validação. **Zero dependências.** | nada |
| `server/` | Repositórios (D1), serviços de aplicação, autenticação, políticas. | `core/` |
| `app/` | UI web e rotas HTTP finas. | `core/`, `server/` |
| `mobile/` | UI Android e armazenamento local. | `core/` |

Regras invioláveis:

- **Nenhum cálculo financeiro fora de `core/`.** Componente React e handler
  HTTP não somam dinheiro.
- **Nenhum acesso a banco fora de `server/repositories/`.**
- **Rota HTTP não contém regra.** Ela valida a entrada, chama um serviço e
  serializa a saída.
- `core/` não conhece HTTP, D1, React nem `localStorage`.

### Compartilhamento web ↔ mobile

`core/` é TypeScript puro no repositório raiz. A web resolve por `paths` no
`tsconfig`; o mobile resolve pelo `watchFolders` do Metro apontando para a
raiz. Uma regra, uma implementação, dois consumidores — sem workspaces npm,
que quebrariam o instalador travado do build de produção.

---

## 2. O razão (ledger) — fonte única de verdade

O erro estrutural da versão anterior era cada tela calcular saldo do seu jeito.
A correção é um **razão**: toda movimentação de dinheiro vira lançamento
contábil, e **todo** saldo, projeção e indicador é uma consulta sobre ele.

```
transactions          o fato que o usuário registra ("Mercado, R$120, no Nubank")
      │ 1..n
ledger_entries        as movimentações de dinheiro que aquele fato causa
```

`ledger_entries` tem valor **com sinal**, aponta para uma conta **ou** para um
cartão, e carrega a competência e a data efetiva.

| Fato | Lançamentos gerados |
| --- | --- |
| Despesa em conta | conta −valor |
| Receita | conta +valor |
| Transferência | origem −valor, destino +valor |
| Compra no crédito | cartão −valor (aumenta a dívida), competência = fatura |
| Pagamento de fatura | conta −valor, cartão +valor |
| Parcela | um lançamento por parcela, cada um na sua competência |

Com isso:

```
saldo da conta        = Σ entries[conta, confirmado, data ≤ hoje]
saldo futuro em D     = Σ entries[conta, data ≤ D]           (inclui previstos)
fatura da competência = −Σ entries[cartão, competência = M]
dívida do cartão      = −Σ entries[cartão]
patrimônio            = Σ contas + Σ investimentos − Σ dívidas
```

Saldo **nunca** é coluna atualizada por delta. É sempre derivado. Uma conta tem
`saldo_inicial` e uma data de abertura; o resto é soma. Isso elimina por
construção a classe inteira de bug "o saldo desandou e ninguém sabe quando".

Compra no crédito não toca conta nenhuma — a dívida só vira saída de caixa no
pagamento da fatura. É isso que impede o gasto ser contado duas vezes.

---

## 3. Modelo de dados

SQLite/D1 com Drizzle. Migrations **versionadas em arquivo**, aplicadas por
comando — nunca DDL em tempo de requisição.

Convenções: identificadores `text` (ULID, ordenável por tempo, sem semântica
embutida); dinheiro em **centavos inteiros**; datas civis em `YYYY-MM-DD`;
competência em `YYYY-MM`; instantes em ISO-8601 UTC; **foreign keys reais**
com `ON DELETE` explícito; toda tabela de usuário tem `user_id`.

### Identidade

- `users` — email, nome, hash e sal da senha.
- `sessions` — sessão única para web e dispositivo (`kind`), com hash do token,
  expiração, revogação e último uso. Substitui as duas tabelas separadas.
- `auth_attempts` — limite de tentativas por janela.

### Cadastros

- `accounts` — nome, instituição, tipo, moeda, **saldo inicial**, data de
  abertura, meta, rendimento mensal, cor, incluir nos totais, protegida,
  arquivada.
- `categories` — nome, fluxo, **categoria pai**, cor, ícone, essencial, ordem.
- `cards` — conta de pagamento (FK), bandeira, tier, últimos 4, limite,
  fechamento, vencimento, ajuste, configuração de recompensa, favorito, ordem.
- `trips` — nome, período, moeda, cotação.

### Núcleo financeiro

- `transactions` — fato do usuário: tipo, descrição, categoria (FK), data,
  valor, moeda, conta ou cartão, conta de contrapartida, competência, situação
  (confirmado / previsto), origem, viagem, plano de parcelamento, recorrência,
  item de importação, versão, exclusão lógica.
- `ledger_entries` — movimentações derivadas. Imutáveis: uma edição apaga e
  regera as do lançamento, na mesma transação.
- `invoices` — **fatura como entidade**: cartão, competência, datas de
  fechamento e vencimento, situação (aberta / fechada / paga / parcial).
- `invoice_payments` — pagamento de fatura, ligado ao lançamento que o
  representa.
- `installment_plans` — compra parcelada: valor original, número de parcelas,
  data da compra, apelido, situação. Cada parcela é uma `transaction` com
  `plan_id` e **`installment_number` inteiro**.

### Regras e automações

- `recurrences` — regra recorrente: papel (comum / salário / benefício /
  assinatura), agendamento (dia do mês ou N-ésimo dia útil), ajuste, modo de
  cálculo (fixo ou por dia útil), vigência, ativa.
- `recurrence_runs` — histórico de execução: competência, lançamento gerado,
  quando rodou.
- `categorization_rules` — texto do estabelecimento → categoria.
- `capture_sources` — regra por app de notificação (permitir / ignorar, conta,
  cartão, categoria padrão).
- `capture_events` — fila de revisão da captura automática.

### Importação

- `import_batches` — arquivo, formato, destino, situação, contadores.
- `import_items` — linha crua + normalizada, impressão digital, veredito de
  duplicidade, categoria sugerida, decisão do usuário, lançamento resultante.

A revisão é um estado do banco, não do navegador.

### Planejamento

- `budgets`, `goals`, `goal_contributions`, `investments`,
  `investment_movements`, `reward_redemptions`.

Assinatura **não** ganha tabela: é uma `recurrence` com papel `subscription`.
Duplicar o agendamento seria repetir a regra mais delicada do sistema.

### Sincronização e apoio

- `sync_mutations` — recibo por `mutation_id`, para idempotência.
- `attachments`, `notifications`, `feedback`, `user_profiles`, `ai_usage`.

---

## 4. Situação de um lançamento

Três estados, sem sobreposição:

- **previsto** — projeção. Não move saldo. Vem de recorrência ou de parcela
  futura.
- **confirmado** — aconteceu. Move saldo.
- **em revisão** — capturado automaticamente, aguardando decisão. Não move
  saldo até ser confirmado.

O bug original — revisar como "ignorado" precisava *reverter* o saldo porque o
dinheiro já tinha se movido na criação — desaparece: em revisão nunca gera
lançamento no razão.

---

## 5. API

REST versionada, um recurso por rota, verbo HTTP com significado. Nada de
endpoint despachante.

```
/api/v1/accounts            GET POST
/api/v1/accounts/:id        GET PATCH DELETE
/api/v1/transactions        GET POST
/api/v1/transactions/:id    GET PATCH DELETE
/api/v1/cards/:id/invoices  GET
/api/v1/invoices/:id/pay    POST
/api/v1/installments        GET POST
/api/v1/installments/:id/anticipate   POST
/api/v1/imports             POST      (envia arquivo, devolve lote em revisão)
/api/v1/imports/:id/commit  POST
/api/v1/dashboard           GET       (indicadores calculados no servidor)
/api/v1/sync                POST
```

Indicadores vêm **prontos do servidor**, calculados por `core/`. O cliente não
recalcula saldo, fatura nem livre para gastar — ele exibe.

Toda entrada passa por um validador tipado antes de chegar ao serviço. Erro de
domínio vira resposta HTTP na borda, com código estável.

---

## 6. Autenticação

Uma tabela de sessões, dois tipos: cookie `HttpOnly` `Secure` `SameSite=Lax`
para a web, token portador para o Android. Senha com PBKDF2-SHA256 e sal por
usuário, comparação em tempo constante, limite de tentativas por janela.
Pareamento do Android continua por confirmação em página autenticada.

Autorização: **todo** repositório recebe o `userId` e filtra por ele. Não
existe consulta sem dono.

---

## 7. Segurança e configuração

Nunca versionar keystore, segredo, credencial ou token. Configuração por
ambiente via variáveis, com `.env.example` documentando as chaves. O keystore
de depuração do Android sai do repositório.

---

## 8. Testes

- `core/` tem cobertura de unidade obrigatória: dinheiro, calendário,
  competência, ciclo de fatura, parcelamento, antecipação, saldo, projeção,
  livre para gastar, duplicidade.
- `server/` tem teste de serviço nos fluxos que movem dinheiro.
- Nenhuma regra financeira entra sem teste que a fixe.

---

## 9. UI

Reconstruída, não copiada. Rotas de verdade (uma por módulo), componentes
pequenos, estado de servidor separado de estado de tela. Hierarquia visual:
resposta primeiro, detalhe sob demanda. Tema claro e escuro. A linguagem visual
da versão anterior — superfícies escuras, acento configurável, números
tabulares, densidade alta — é referência, não gabarito.
