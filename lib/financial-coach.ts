import { createStructuredResponse } from "./openai-responses";

export type FinancialCoachResult = {
  answer: string;
  summary: string;
  actions: Array<{ label: string; reason: string; priority: "high" | "medium" | "low" }>;
  warnings: string[];
};

const coachSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    summary: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" }, reason: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["label", "reason", "priority"],
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["answer", "summary", "actions", "warnings"],
} as const;

export async function askFinancialCoach(input: { apiKey: string; model: string; question: string; context: unknown }) {
  return createStructuredResponse<FinancialCoachResult>({
    apiKey: input.apiKey,
    model: input.model,
    schemaName: "financial_coach",
    schema: coachSchema,
    maxOutputTokens: 1600,
    system: `Você é o assistente financeiro do Fluxo. Responda em português brasileiro com linguagem curta, clara e acionável. Use somente os dados fornecidos; nunca invente saldos, transações ou projeções. Explique a conta por trás das recomendações quando houver números. Priorize fluxo de caixa, compromissos, orçamento e reserva de emergência. Não trate estimativas como garantia e não dê recomendação definitiva de investimento sem conhecer prazo, liquidez e tolerância a risco. Se faltarem dados, diga exatamente o que falta. Evite frases genéricas e limite as ações às três mais úteis.`,
    content: [{ type: "input_text", text: `Pergunta do usuário:\n${input.question}\n\nContexto financeiro isolado desta conta:\n${JSON.stringify(input.context)}` }],
  });
}
