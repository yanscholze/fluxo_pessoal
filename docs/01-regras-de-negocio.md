# Fluxo — Regras de negócio

Este documento é o patrimônio extraído da primeira implementação. Descreve **o
que o Fluxo faz**, independente de como estava codificado. É a especificação
que a reconstrução precisa honrar.

Referência histórica: commit `0dafcd3` (branch `main`) preserva o código
original íntegro.

---

## 1. Competência — o conceito central

O Fluxo separa **mês civil** de **mês financeiro (competência)**.

- Lançamento em conta (débito, dinheiro, transferência): competência = mês da data.
- Compra no crédito: competência = **mês da fatura em que ela cai**, não o mês da compra.

### Ciclo de fatura

Cada cartão tem `diaFechamento` e `diaVencimento`.

A data de fechamento de uma competência é o `diaFechamento` daquele mês,
**ajustado para o dia útil anterior** quando cai em fim de semana ou feriado.

Regra de atribuição de uma compra:

```
se dataDaCompra <= fechamento(mêsDaCompra)  → competência = mêsDaCompra
senão                                        → competência = mêsDaCompra + 1
```

Exemplo com fechamento dia 13:

| Compra | Competência |
| --- | --- |
| 13/08 | 2026-08 |
| 14/08 | 2026-09 |

A **janela do ciclo** ativo em uma data é `(fechamentoAnterior, fechamentoSeguinte]`
— de 14 de um mês a 13 do seguinte. Não é o mês civil. Isso importa porque a
renda que entra depois do fechamento já pertence economicamente à fatura
seguinte.

### Vencimento

```
se diaVencimento <= diaFechamento → vence no mês seguinte ao da competência
senão                              → vence no mesmo mês da competência
```

A data resultante é ajustada ao dia útil conforme o `ajusteVencimento` do
cartão (`próximo` por padrão, `anterior` opcional).

### Fatura ativa

A fatura ativa de um cartão hoje é a competência corrente se hoje ainda não
passou do fechamento; caso contrário, a próxima. Faturas anteriores à ativa que
ainda tenham saldo devedor estão **em atraso**.

---

## 2. Calendário brasileiro

Dias úteis excluem sábados, domingos e feriados bancários nacionais.

Feriados fixos: 01-01, 04-21, 05-01, 09-07, 10-12, 11-02, 11-15, 11-20, 12-25.

Feriados móveis, derivados da Páscoa (algoritmo de Gauss/Meeus):
segunda e terça de Carnaval (−48, −47), Sexta-feira da Paixão (−2),
Corpus Christi (+60).

Usos: ajuste de fechamento e vencimento, agendamento de recorrências por
"N-ésimo dia útil do mês", e cálculo do vale-alimentação (valor por dia útil ×
dias úteis do mês).

---

## 3. Saldo, patrimônio e comprometimento

Quatro conceitos que **não podem se misturar**:

| Conceito | Definição |
| --- | --- |
| **Saldo atual** | Dinheiro que existe agora em cada conta. |
| **Patrimônio** | Ativos (contas + investimentos) − passivos (dívida de cartão + demais dívidas). |
| **Comprometido** | Obrigações futuras já assumidas: fatura em aberto, parcelas a vencer, despesas previstas. |
| **Livre para gastar** | O que pode ser gasto sem furar compromisso já assumido. |
| **Fluxo futuro** | Como receitas e despesas futuras alteram o saldo ao longo do tempo. |

### O que move saldo

Uma compra no crédito **não move saldo de conta** — ela aumenta a dívida do
cartão. O saldo só muda quando a fatura é paga.

Movem saldo: débito, dinheiro, transferência (e apenas lançamentos confirmados,
nunca previstos).

### Livre para gastar

É o **menor saldo projetado** do horizonte:

```
percorre a linha do tempo a partir do saldo de hoje,
somando cada receita prevista e subtraindo cada compromisso
na data em que ele acontece — inclusive o pagamento de cada
fatura em aberto, na data do vencimento.
A folga é o ponto mais baixo dessa curva.
```

**Não** é `saldo + entradas − saídas` do período. Essa soma ignora a ordem dos
fatos, e a ordem é o problema inteiro: com R$ 3.000 na conta, R$ 6.000 de
salário no dia 8 e R$ 1.950 de aluguel no dia 10, a soma responde R$ 7.050 — e
gastar R$ 7.050 no dia 5 deixa a conta negativa até o dia 8. Dinheiro que entra
depois de uma conta vencer não paga essa conta.

O horizonte vai até o fim do **ciclo de fatura** do cartão de referência ou até
o último vencimento em aberto, o que for mais longe — é o que garante que o
salário que cai antes do vencimento seja contado junto com a fatura, em vez de
um dos dois ficar de fora por acaso do calendário.

O resultado pode ser **negativo**: significa que os compromissos já assumidos
não cabem no que existe mais o que está por entrar.

"Saldo líquido" soma apenas contas corrente / dinheiro / benefício em BRL, e
ignora contas marcadas como fora dos totais. Investimento não entra: não é
dinheiro pensado para gastar.

Fatura em aberto conta **só o que existe no razão**. Uma assinatura recorrente
ainda não lançada é gasto futuro, não dívida de hoje: somá-la criaria um saldo
devedor sem lançamento para quitar, que nenhum pagamento zera.

### Reserva de emergência

Meta recomendada = média dos gastos das categorias marcadas como **essenciais**
nos últimos 6 meses × 6.

---

## 4. Parcelamentos

Uma compra parcelada gera **N parcelas**, uma por competência consecutiva.

- Máximo 48 parcelas.
- O valor total é dividido em centavos; o resto é distribuído centavo a centavo
  nas primeiras parcelas, de modo que a soma das parcelas seja exatamente o
  valor da compra.
- Cada parcela tem sua própria competência, sua própria data e cai na fatura
  correspondente.
- Recompensas (pontos/cashback) rendem **sobre o valor da parcela**, não sobre
  o total, na competência de cada parcela.

Status de cada parcela:

- **Paga**: competência anterior à fatura ativa e aquela fatura foi quitada.
- **Atrasada**: competência anterior à ativa e aquela fatura ainda tem saldo.
- **Em aberto**: competência igual ou posterior à fatura ativa.

### Antecipação

O usuário pode antecipar parcelas. A antecipação move parcelas pendentes para a
fatura ativa e deve recalcular corretamente o fluxo futuro: mostrar economia,
novo mês de término e quanto libera por mês.

### Visão de comprometimento futuro

Total comprometido por mês à frente, somando todas as parcelas em aberto.

---

## 5. Faturas

A fatura é entidade própria, não uma categoria de despesa.

Cada cartão expõe: fechamento, vencimento, limite, disponível, fatura atual,
próximas faturas e pagamentos.

- **Total da fatura** = soma das compras da competência.
- **Restante em aberto** = total − pagamentos já feitos.
- **Limite disponível** = limite − soma dos saldos positivos de todas as
  faturas da competência atual em diante (inclui parcelas futuras já
  comprometidas).

### Pagamento de fatura

Um pagamento **não é uma nova despesa** — é uma transferência que reduz o saldo
da conta pagadora e reduz a dívida do cartão. Contabilizá-lo como despesa
duplicaria o gasto.

Validações: valor > 0, valor ≤ restante em aberto, saldo suficiente na conta
pagadora. Aceita pagamento parcial.

---

## 6. Recorrências e automações

Uma recorrência é uma **regra**, não um lançamento. Ela projeta lançamentos
previstos para os meses à frente.

Campos: descrição, tipo, categoria, conta ou cartão, valor, agendamento,
ativo/pausado, última execução.

### Agendamento

Dois modos:

- **Dia do mês**: dia fixo, ajustado ao dia útil anterior ou próximo.
- **N-ésimo dia útil do mês**: usado para salário.

### Modo de cálculo

- **Fixo**: o valor é o valor.
- **Por dia útil**: valor × dias úteis do mês. É como funciona o
  vale-alimentação (VA).

### Salário e benefício

Na implementação original eram regras singleton com IDs reservados. São apenas
recorrências com um papel (`salário`, `benefício`, `assinatura`) — o
comportamento de agendamento e projeção é o mesmo.

O usuário confirma o recebimento; a confirmação é idempotente por competência.

### Histórico

Cada execução de automação precisa ser registrada: quando rodou, o que gerou.

---

## 7. Importação

Formatos: **OFX** e **CSV**. PDF não é suportado.

Pipeline obrigatório com revisão antes de persistir:

```
arquivo → parser → normalização → duplicidade → transferência →
categorização → revisão → confirmação → persistência
```

### Parsing

- **CSV**: delimitador `;` ou `,` detectado pela primeira linha; colunas
  localizadas por palavra-chave (data/date, descrição/description/memo/
  estabelecimento, valor/amount, parcela/installment); datas `DD/MM/AAAA` e
  `AAAA-MM-DD`; valores em formato BR e US.
- **OFX**: blocos `STMTTRN`/`CCSTMTTRN`; descrição de `NAME` + `MEMO`; `FITID`
  como identidade estável; `TRNTYPE` infere crédito/débito.

### Descartes esperados

Linhas sem data, descrição ou valor; pagamentos de fatura (que já são
representados pelo pagamento em si); estornos e créditos em contexto de cartão.

### Parcelas em arquivo

Reconhece `3/10` e `parcela 3 de 10` (até 48), limpa o marcador da descrição e
gera as parcelas restantes nas competências corretas, preservando o
deslocamento entre data da compra e competência.

### Duplicidade

Identidade canônica escopada por competência + cartão + parcela. Itens com
`FITID` usam o FITID puro. Para parcelamentos vindos de OFX, tolerância de
±5 centavos, porque emissores distribuem arredondamento entre parcelas.

Cada lote recebe um identificador para permitir exclusão em bloco.

### Relatório de importação

```
147 encontradas · 142 novas · 5 duplicadas · 3 sem categoria · 2 possíveis transferências
```

---

## 8. Transferências

Transferência move dinheiro entre duas contas do próprio usuário. Não é
receita nem despesa e **não deve aparecer em relatório de gastos**.

Validações: as duas contas existem, pertencem ao usuário, são diferentes e
nenhuma delas é cartão de crédito.

---

## 9. Captura automática (Android)

O app móvel lê notificações bancárias e propõe lançamentos.

Cascata de decisão:

1. Apps de carteira (Samsung/Google Wallet) → sempre ignorados.
2. App fora da lista confiável e sem regra manual → ignorado (**opt-in**).
3. Mesmo valor + mesmo estabelecimento em janela de 3 horas → duplicado.
4. Confiança baixa → fila de revisão, sem afetar saldo.
5. Caso contrário → lançamento criado com marca de "não revisado".

Extração: valor por regex `R$ X,XX`; entrada inferida por "receb/creditad/
entrada/depósito"; método por "boleto"/"crédito"/"débito|pix" (decide se cai na
conta ou no cartão); parcelas por "em 3x"/"parcelado em 3 vezes";
estabelecimento após "em/para/de". Confiança 0,85 com estabelecimento
identificado, 0,45 sem.

Regras por app (conta/cartão/categoria padrão) e regras por estabelecimento
(texto → categoria) são configuráveis.

---

## 10. Recompensas de cartão

Configuração por cartão: modo (nenhum / pontos / cashback / ambos), pontos por
dólar, percentual de cashback, meta de pontos, cotação manual de contingência.

- **Pontos** = valor ÷ cotação USD × pontosPorDólar
- **Cashback** = valor × percentual

A cotação usada é a PTAX do Banco Central, com fallback para a cotação manual
do cartão. Cada lançamento guarda o snapshot da cotação usada.

Apenas compras de faturas **já fechadas** rendem saldo resgatável.

Resgates: pontos ou cashback; cashback exige conta de destino e credita a
conta; aceita resgate parcial; nunca acima do saldo disponível.

---

## 11. Modo viagem

Uma viagem é uma **etiqueta** sobre lançamentos: não altera conta, fatura nem
categoria.

Campos: nome, data início, data fim, moeda, cotação.

Exibe: status (planejada / em andamento / concluída), gasto total em BRL,
equivalente na moeda da viagem, gastos por categoria e lançamentos. A conversão
é informativa — os saldos continuam em reais.

---

## 12. Contas

Tipos: conta corrente, dinheiro, benefício, investimento.

Campos: nome, instituição, moeda, saldo, meta, rentabilidade mensal, cor,
"não somar nos totais", conta fixa (protegida contra exclusão).

Moedas aceitas: BRL, USD, EUR, GBP, ARS, CAD, JPY, CHF.

Regra: **dinheiro futuro não pode aparecer como dinheiro atual.**

Uma conta só pode ser excluída se não houver lançamento, cartão, recorrência ou
resgate vinculado.

---

## 13. Categorias

Separadas por fluxo: **gastos** e **receitas**.

Campos: nome, ícone, cor, categoria pai, orçamento, essencial.

"Essencial" alimenta o cálculo da reserva de emergência.

Ao abrir uma categoria: evolução, transações, média, maior e menor gasto,
orçamento e subcategorias.

Categorias normalizadas "empréstimo de cartão" ficam fora do cálculo de livre
para gastar.

---

## 14. Módulos de planejamento

- **Orçamentos**: orçamento, gasto, disponível, percentual e projeção de fim de
  mês baseada no ritmo atual.
- **Metas**: objetivo, valor atual, valor alvo, quanto falta, prazo, aporte
  mensal, previsão de conclusão.
- **Assinaturas**: custo mensal, custo anual, quantidade ativa, próximas
  cobranças e total dos próximos 7 dias.
- **Investimentos**: patrimônio investido, rentabilidade, evolução,
  distribuição; por ativo: valor, percentual, rendimento, aportes, histórico,
  vencimento, instituição, liquidez.
- **Saúde financeira**: livre para gastar, reserva, taxa de poupança,
  comprometimento, parcelamentos, dívidas, orçamento e agenda dos próximos
  eventos.

---

## 15. Relatórios

Períodos: mês, 3 meses, 6 meses, 1 ano, personalizado.

Indicadores: receitas, despesas, saldo líquido, taxa de poupança,
investimentos, dívidas, parcelamentos.

Gráficos: receitas × despesas, saldo, categorias, patrimônio, dívidas, fluxo
mensal. Exportação CSV.

---

## 16. Sincronização web ↔ mobile

Offline-first no mobile: banco local, fila de saída, reconciliação ao voltar
online.

Protocolo: lotes de no máximo 50 mutações, cada uma com `mutationId`
(idempotência) e `baseVersion` (concorrência otimista). Resultados possíveis:
aplicada, conflito, duplicada, sem efeito, rejeitada. Exclusão é lógica
(soft delete).

Limitação da versão original a corrigir: apenas lançamentos sincronizavam, e
toda resposta devolvia o snapshot inteiro (sem sincronização incremental).

---

## 17. Autenticação

- E-mail + senha (mínimo 10 caracteres), hash PBKDF2 com sal por usuário.
- Sessão web por cookie; sessão de dispositivo por token portador, com
  validade e revogação.
- Pareamento do Android por confirmação em página web autenticada — a senha
  nunca sai do navegador.
- Limite de tentativas de autenticação por janela.

---

## 18. Assistente de IA

Consulta em linguagem natural sobre a própria situação financeira.

Contexto enviado: do mês anterior a 2 meses à frente, no máximo 600
lançamentos — totais do período, contas, cartões, gastos por categoria e a
lista de lançamentos.

Regras do assistente: responder em português, usar exclusivamente os dados
fornecidos, focar em fluxo de caixa / compromissos / reserva, no máximo 3 ações
sugeridas, e **nunca** dar recomendação definitiva de investimento.

Resposta estruturada: resposta, resumo, ações (rótulo, motivo, prioridade),
avisos.

Quotas diárias por usuário: 60 consultas ao assistente, 30 leituras de cupom.

### OCR de cupom fiscal

Extrai estabelecimento, descrição, data, **total efetivamente pago** (nunca
subtotal, troco, desconto ou tributo), categoria dentro da lista do usuário,
dica de método de pagamento, itens (até 40), confiança e avisos.

---

## 19. Vocabulário do produto

Livre para gastar · Comprometido · Competência · Fatura em aberto · Reserva de
emergência · Gasto essencial · Dias úteis · VA por dia útil · Dia útil anterior
/ próximo · Antecipar parcela · Parcelamento quitado / em andamento · Previsto
vs. Confirmado · Modo viagem · Aguardando sincronização · Automático / Não
revisado / Duplicado · Saldo líquido · Patrimônio · Cotação PTAX BCB · Extrato
de recompensas · Lote de importação.

---

## 20. Problemas da implementação original — a evitar

Levantados durante a descoberta. A nova arquitetura existe para que nenhum
deles seja possível.

1. **Relacionamento por nome.** Conta e categoria eram referenciadas por texto
   nas transações, exigindo renomeação em cascata por cinco tabelas.
2. **Saldo materializado por deltas.** `balance_cents` era atualizado
   incrementalmente a cada escrita e podia ser sobrescrito pelo cliente —
   qualquer falha parcial corrompia o saldo em definitivo.
3. **Semântica codificada em identificador.** `invoice-payment:<id>`,
   `${grupo}-${índice}`, `recurring-salary` — o sistema fazia `startsWith` e
   regex em IDs para decidir regra de negócio.
4. **Parcela como texto.** `"3/12"` era parseado com expressão regular em vez
   de duas colunas inteiras.
5. **Efeito colateral em leitura.** O `GET` do snapshot inseria 13 meses de
   lançamentos previstos no banco.
6. **Endpoint despachante.** Um único `POST` decidia entre 15 operações pela
   presença de uma chave no corpo.
7. **Cálculo financeiro no cliente.** Nenhum agregado era calculado no
   servidor; cada tela refazia sua própria conta.
8. **Regra duplicada entre web e mobile.** Calendário e período financeiro
   existiam em duas cópias divergentes.
9. **Sem migrations versionadas.** O schema era garantido por `CREATE TABLE IF
   NOT EXISTS` + introspecção `PRAGMA` a cada requisição.
10. **Sem integridade referencial.** Nenhuma foreign key; órfãos dependiam de
    disciplina do código.
11. **Adivinhação silenciosa.** "Se existe exatamente um cartão de crédito,
    assuma esse."
12. **Componente monolítico.** Uma página de 1504 linhas com todas as telas,
    todo o estado e cálculo financeiro embutido no JSX.

---

## Trabalho

### Horas

A unidade é o **milésimo de hora**, inteiro: meia hora é 500, um quarto é 250,
e quatro quartos somam exatamente 1000. É a mesma decisão do dinheiro em
centavos, pelo mesmo motivo — oito sessões de 0,1h em decimal somam
0,7999999999999999, e o valor a cobrar sai um centavo errado.

A API recebe **minutos inteiros**; a conversão acontece uma única vez, na
borda.

O valor/hora é **congelado no registro** da sessão. Reajustar o valor do
projeto não reescreve o que já foi trabalhado por outro preço.

### Valor/hora efetivo

```
recebido ÷ tempo total trabalhado
```

Divide pelo tempo **todo**, cobrável ou não. Usar só as horas cobráveis
inflaria o número justamente nos projetos que deram mais retrabalho —
escondendo o prejuízo que se quer enxergar.

Sem tempo registrado o resultado é **nulo**, não zero nem infinito.

### Cobrança de projeto

Uma parcela do contrato é previsão enquanto não tem lançamento associado.
Ao ser recebida, cria uma **receita no razão**, na conta escolhida — e a partir
daí o dinheiro do trabalho conta no saldo, no patrimônio e no livre para gastar
como qualquer outro.

O caminho inverso não existe: apagar a receita no extrato não desmarca a
parcela. Quem decide sobre a parcela é o projeto.

Contrato sem parcela agendada aparece como número próprio — é dinheiro
combinado que ninguém vai cobrar sozinho.

### Suporte não é funcionalidade nova

Suporte é consertar o que deveria funcionar, e nasce **não cobrável**.
Funcionalidade nova é desenvolvimento e nasce cobrável. Misturar os dois numa
lista de "tarefas" apaga a diferença que decide o que entra na próxima fatura.
