/**
 * Leitura de cupom fiscal.
 *
 * O modelo lê a foto e devolve os campos de um lançamento. Nada é gravado: a
 * saída volta para o formulário, o usuário confere e confirma. Um OCR que grava
 * sozinho transforma um erro de leitura em erro de saldo.
 */

import { validationError } from "../../../core/kernel/errors.ts";
import { parseLocalDate, todayIn } from "../../../core/time/local-date.ts";
import { listCategories } from "../../repositories/catalog.ts";
import { ask, assertConfigured } from "./client.ts";
import { consume } from "./quota.ts";

/** Teto da imagem enviada. Foto de cupom cabe folgado. */
const MAX_IMAGE_BYTES = 6_000_000;

export type ReceiptItem = {
  readonly description: string;
  readonly quantity: number;
  readonly unitCents: number;
  readonly totalCents: number;
};

export type ReceiptReading = {
  readonly merchant: string;
  readonly description: string;
  readonly occurredOn: string | null;
  readonly totalCents: number;
  readonly categoryName: string | null;
  readonly paymentHint: "credit" | "debit" | "cash" | "unknown";
  readonly items: readonly ReceiptItem[];
  readonly confidence: number;
  readonly warnings: readonly string[];
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "merchant",
    "description",
    "occurredOn",
    "totalCents",
    "categoryName",
    "paymentHint",
    "items",
    "confidence",
    "warnings",
  ],
  properties: {
    merchant: { type: "string", description: "Nome do estabelecimento" },
    description: { type: "string", description: "Descrição curta para o lançamento" },
    occurredOn: { type: ["string", "null"], description: "Data no formato AAAA-MM-DD" },
    totalCents: { type: "integer", description: "Total efetivamente pago, em centavos" },
    categoryName: { type: ["string", "null"], description: "Uma das categorias fornecidas, ou null" },
    paymentHint: { type: "string", enum: ["credit", "debit", "cash", "unknown"] },
    items: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "quantity", "unitCents", "totalCents"],
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unitCents: { type: "integer" },
          totalCents: { type: "integer" },
        },
      },
    },
    confidence: { type: "number", description: "0 a 1" },
    warnings: { type: "array", items: { type: "string" } },
  },
} as const;

const INSTRUCTIONS = `Você lê cupons fiscais e notas brasileiras e extrai os dados de um lançamento.

REGRAS CRÍTICAS:
- \`totalCents\` é o TOTAL EFETIVAMENTE PAGO, em centavos. NUNCA use subtotal,
  troco, desconto, acréscimo ou valor de tributos. Se o cupom mostra "Total R$ 87,50"
  e "Valor pago R$ 100,00" com "Troco R$ 12,50", o total é 8750.
- Não invente. Campo que você não conseguir ler com segurança volta null, e o
  motivo entra em \`warnings\`.
- \`categoryName\` precisa ser EXATAMENTE uma das categorias fornecidas, ou null.
  Não crie categoria nova.
- \`occurredOn\` no formato AAAA-MM-DD. Cupom brasileiro escreve DD/MM/AAAA — converta.
- \`confidence\` reflete a legibilidade: foto tremida ou cortada tem confiança baixa.
- Itens são opcionais. Se a lista estiver ilegível, devolva vazia em vez de chutar.`;

export type ReadReceiptInput = {
  /** Imagem em data URL (`data:image/jpeg;base64,...`). */
  readonly imageDataUrl: string;
};

export async function readReceipt(
  userId: string,
  input: ReadReceiptInput,
  now: Date = new Date(),
): Promise<{ reading: ReceiptReading; remaining: number }> {
  // A validação e a checagem de configuração vêm antes da cota: nenhuma das
  // duas chega a chamar o modelo, e cobrar por elas gastaria a cota do usuário
  // sem que nada tivesse rodado.
  assertConfigured();
  assertImage(input.imageDataUrl);

  const quota = await consume(userId, "receipt", now);
  const categorias = await listCategories(userId);
  const deSaida = categorias.filter((item) => item.kind === "expense").map((item) => item.name);

  const bruto = await ask<ReceiptReading>({
    instructions: INSTRUCTIONS,
    schemaName: "leitura_de_cupom",
    schema: SCHEMA,
    content: [
      {
        type: "input_text",
        text: `Hoje é ${todayIn(now)}. Categorias disponíveis: ${deSaida.join(", ") || "nenhuma"}.`,
      },
      { type: "input_image", image_url: input.imageDataUrl },
    ],
  });

  return { reading: sanitize(bruto, deSaida), remaining: quota.remaining };
}

function assertImage(dataUrl: string): void {
  if (!/^data:image\/(jpeg|jpg|png|webp|heic);base64,/i.test(dataUrl)) {
    throw validationError("Envie uma foto em JPEG, PNG ou WebP", [
      { path: "image", message: "Formato de imagem não suportado" },
    ]);
  }
  // Base64 cresce ~4/3 sobre o binário; a conta aproximada basta para o teto.
  if ((dataUrl.length * 3) / 4 > MAX_IMAGE_BYTES) {
    throw validationError("A foto está grande demais", [
      { path: "image", message: "Use uma foto de até 6 MB" },
    ]);
  }
}

/**
 * Confere o que veio do modelo.
 *
 * O schema garante o formato, não a sanidade: total negativo, data impossível
 * ou categoria inventada passariam. Aqui eles viram `null` mais um aviso, em
 * vez de virarem lançamento errado.
 */
function sanitize(bruto: ReceiptReading, categoriasValidas: readonly string[]): ReceiptReading {
  const avisos = [...(bruto.warnings ?? [])];

  const total = Number.isInteger(bruto.totalCents) && bruto.totalCents > 0 ? bruto.totalCents : 0;
  if (total === 0) avisos.push("Não foi possível ler o total do cupom com segurança.");

  const data = bruto.occurredOn ? parseLocalDate(bruto.occurredOn) : null;
  if (bruto.occurredOn && !data) avisos.push(`Data ilegível no cupom: "${bruto.occurredOn}".`);

  const categoria =
    bruto.categoryName && categoriasValidas.includes(bruto.categoryName) ? bruto.categoryName : null;
  if (bruto.categoryName && !categoria) {
    avisos.push(`A categoria sugerida ("${bruto.categoryName}") não existe no seu cadastro.`);
  }

  return {
    merchant: (bruto.merchant ?? "").slice(0, 120),
    description: (bruto.description || bruto.merchant || "Compra").slice(0, 160),
    occurredOn: data,
    totalCents: total,
    categoryName: categoria,
    paymentHint: bruto.paymentHint ?? "unknown",
    items: (bruto.items ?? [])
      .filter((item) => item.description && Number.isInteger(item.totalCents) && item.totalCents >= 0)
      .slice(0, 40),
    confidence: Math.max(0, Math.min(1, Number(bruto.confidence) || 0)),
    warnings: avisos,
  };
}
