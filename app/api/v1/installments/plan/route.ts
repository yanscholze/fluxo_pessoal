/**
 * `POST /api/v1/installments/plan` — cria um parcelamento com as parcelas que
 * já aconteceram.
 *
 * Existe para a importação por conciliação. O caminho normal
 * (`POST /api/v1/transactions` com `installmentCount`) **gera** o cronograma a
 * partir da compra, e para dados vindos da fatura isso está errado: o
 * cronograma já existe, veio do emissor, e um gerado por cima não fecha com
 * o extrato.
 *
 * Rota fina: valida, chama o serviço, devolve.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../server/http/respond.ts";
import { importInstallmentPlan } from "../../../../../server/services/transactions.ts";
import { competence as parseCompetence } from "../../../../../core/time/competence.ts";
import { localDate } from "../../../../../core/time/local-date.ts";
import { cents } from "../../../../../core/kernel/money.ts";
import { validationError } from "../../../../../core/kernel/errors.ts";

export const dynamic = "force-dynamic";

/** Teto por plano. Bem acima de qualquer parcelamento real de cartão. */
const MAX_PARCELAS = 96;

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const body = await readJson(request);
  const input = read(body);

  const payload = {
    cardId: input.reference("cardId"),
    description: input.string("description", { max: 160 }),
    categoryId: input.optionalReference("categoryId"),
    totalAmount: input.money("totalAmount"),
    installmentCount: input.integer("installmentCount", { min: 1, max: MAX_PARCELAS }),
    purchaseDate: input.date("purchaseDate"),
  };

  const cru = (body as Record<string, unknown>).parcels;
  if (!Array.isArray(cru) || cru.length === 0 || cru.length > MAX_PARCELAS) {
    throw validationError("Informe as parcelas do plano", [
      { path: "parcels", message: `Envie de 1 a ${MAX_PARCELAS} parcelas` },
    ]);
  }

  // As parcelas são validadas à mão: o leitor de entrada trabalha sobre campos
  // do corpo, não sobre itens de uma lista, e forçá-lo a isso esconderia qual
  // parcela está errada — que é justamente o que quem importa precisa saber.
  const parcels = cru.map((item, indice) => {
    const parcela = item as Record<string, unknown>;
    const numero = Number(parcela.number);
    const valor = Number(parcela.amountCents);
    const quando = String(parcela.occurredOn ?? "");
    const competencia = String(parcela.competence ?? "");
    const estado = parcela.state === "planned" ? "planned" : "confirmed";

    if (!Number.isInteger(numero) || numero < 1 || numero > MAX_PARCELAS || !Number.isFinite(valor) || valor <= 0) {
      throw validationError("Parcela inválida", [
        { path: `parcels.${indice}`, message: "Número e valor da parcela precisam ser positivos" },
      ]);
    }

    return {
      number: numero,
      amount: cents(Math.round(valor)),
      occurredOn: localDate(quando),
      competence: parseCompetence(competencia),
      state: estado as "confirmed" | "planned",
    };
  });

  input.done();

  const resultado = await importInstallmentPlan(user.id, { ...payload, parcels });
  return json({ data: resultado }, { status: 201 });
});
