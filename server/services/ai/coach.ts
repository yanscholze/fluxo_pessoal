/**
 * Assistente financeiro.
 *
 * Responde em cima dos dados do usuário, e só deles. O contexto é montado aqui
 * — o modelo não consulta nada e não inventa números: se a informação não
 * estiver no pacote enviado, a instrução manda dizer que não sabe.
 */

import { competenceOf, range, shift } from "../../../core/time/competence.ts";
import { todayIn } from "../../../core/time/local-date.ts";
import { buildHealthView } from "../health.ts";
import { listAccounts, listCards, listCategories } from "../../repositories/catalog.ts";
import { listTransactions } from "../../repositories/ledger.ts";
import { buildReport } from "../reports.ts";
import { ask, assertConfigured } from "./client.ts";
import { consume } from "./quota.ts";

/** Teto de lançamentos no contexto. Além disso o prompt fica caro sem ganhar precisão. */
const MAX_TRANSACTIONS = 400;

export type Advice = {
  readonly answer: string;
  readonly summary: string;
  readonly actions: readonly { label: string; reason: string; priority: "alta" | "media" | "baixa" }[];
  readonly warnings: readonly string[];
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "summary", "actions", "warnings"],
  properties: {
    answer: { type: "string", description: "Resposta direta à pergunta, em português" },
    summary: { type: "string", description: "Uma frase resumindo a situação" },
    actions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "reason", "priority"],
        properties: {
          label: { type: "string" },
          reason: { type: "string" },
          priority: { type: "string", enum: ["alta", "media", "baixa"] },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

const INSTRUCTIONS = `Você é o assistente financeiro do Fluxo, um app pessoal brasileiro.

REGRAS:
- Responda em português do Brasil, direto, sem rodeio nem saudação.
- Use EXCLUSIVAMENTE os dados fornecidos. Se a informação não estiver neles, diga
  que não tem esse dado — nunca estime, nunca invente um número.
- Cite valores concretos que estão nos dados. Uma resposta sem número é inútil aqui.
- Foque em fluxo de caixa, compromissos assumidos e reserva de emergência.
- No máximo 3 ações sugeridas, e cada uma precisa ser algo que o usuário faz esta semana.
- NUNCA recomende um investimento específico nem prometa retorno. Você não é
  consultor de investimentos e dizer "aplique em X" seria recomendação
  personalizada, que exige registro profissional.
- Valores chegam em CENTAVOS. Converta para reais ao escrever (1234 = R$ 12,34).`;

export type AskCoachInput = {
  readonly question: string;
};

export async function askCoach(
  userId: string,
  input: AskCoachInput,
  now: Date = new Date(),
): Promise<{ advice: Advice; remaining: number }> {
  // Conferir a configuração antes de consumir a cota: numa instalação sem
  // chave, toda tentativa queimaria uma consulta que nunca chegou a acontecer.
  assertConfigured();

  const quota = await consume(userId, "advice", now);
  const contexto = await buildContext(userId, now);

  const advice = await ask<Advice>({
    instructions: INSTRUCTIONS,
    schemaName: "conselho_financeiro",
    schema: SCHEMA,
    content: [
      { type: "input_text", text: `Pergunta do usuário: ${input.question}` },
      { type: "input_text", text: `Dados financeiros (JSON):\n${JSON.stringify(contexto)}` },
    ],
  });

  return { advice, remaining: quota.remaining };
}

/**
 * O pacote de dados enviado ao modelo.
 *
 * Do mês anterior a dois meses à frente: é a janela em que as perguntas
 * acontecem. Mandar o histórico inteiro encareceria sem melhorar a resposta.
 */
async function buildContext(userId: string, now: Date) {
  const hoje = todayIn(now);
  const competencia = competenceOf(hoje);
  const janela = range(shift(competencia, -1), shift(competencia, 2));

  const [saude, relatorio, contas, cartoes, categorias, lancamentos] = await Promise.all([
    buildHealthView(userId, now),
    buildReport(userId, "3m", now),
    listAccounts(userId),
    listCards(userId),
    listCategories(userId),
    listTransactions(userId, { limit: MAX_TRANSACTIONS }),
  ]);

  const nomeCategoria = new Map(categorias.map((item) => [item.id, item.name]));
  const nomeConta = new Map(contas.map((item) => [item.id, item.name]));
  const nomeCartao = new Map(cartoes.map((item) => [item.id, item.name]));

  return {
    hoje,
    competenciaAtual: competencia,
    moeda: "BRL",
    unidade: "centavos",
    posicao: {
      livreParaGastarCentavos: saude.freeToSpendCents,
      patrimonioCentavos: saude.netWorthCents,
      taxaDePoupancaPercentual: Math.round(saude.savingsRatePercent),
      rendaDoMesCentavos: saude.commitment.monthlyIncomeCents,
      comprometidoCentavos: saude.commitment.committedCents,
    },
    reserva: {
      atualCentavos: saude.reserve.currentCents,
      alvoCentavos: saude.reserve.targetCents,
      mesesCobertos: Number(saude.reserve.monthsCovered.toFixed(1)),
      gastoEssencialMensalCentavos: saude.reserve.monthlyEssentialCents,
    },
    dividas: {
      faturaDeCartaoCentavos: saude.debts.cardDebtCents,
      faturasEmAtraso: saude.debts.overdueInvoices,
      parcelasAVencerCentavos: saude.debts.openInstallmentsCents,
    },
    contas: contas.map((conta) => ({
      nome: conta.name,
      tipo: conta.kind,
      moeda: conta.currency,
    })),
    cartoes: cartoes
      .filter((cartao) => cartao.kind === "credit")
      .map((cartao) => ({
        nome: cartao.name,
        limiteCentavos: cartao.limitCents,
        fechamento: cartao.closingDay,
        vencimento: cartao.dueDay,
      })),
    ultimosTresMeses: relatorio.monthly.map((ponto) => ({
      competencia: ponto.competence,
      entradasCentavos: ponto.incomeCents,
      saidasCentavos: ponto.expenseCents,
    })),
    gastosPorCategoria: relatorio.expensesByCategory.slice(0, 12).map((item) => ({
      categoria: item.name,
      totalCentavos: item.amountCents,
      lancamentos: item.transactionCount,
    })),
    agenda: saude.agenda.map((evento) => ({
      data: evento.date,
      descricao: evento.description,
      valorCentavos: evento.amountCents,
      direcao: evento.direction === "in" ? "entrada" : "saida",
    })),
    lancamentos: lancamentos
      .filter((item) => janela.includes(item.competence))
      .map((item) => ({
        data: item.occurredOn,
        descricao: item.description,
        valorCentavos: item.amount,
        tipo: item.kind,
        situacao: item.state,
        categoria: item.categoryId ? (nomeCategoria.get(item.categoryId) ?? null) : null,
        origem:
          item.origin.kind === "account"
            ? (nomeConta.get(item.origin.accountId) ?? null)
            : (nomeCartao.get(item.origin.cardId) ?? null),
      })),
  };
}
