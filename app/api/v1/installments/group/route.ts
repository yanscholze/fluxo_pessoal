/** Agrupa despesas avulsas do mesmo cartão num parcelamento existente. */

import { validationError } from "../../../../../core/kernel/errors.ts";
import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../server/http/respond.ts";
import { groupTransactionsIntoInstallmentPlan } from "../../../../../server/services/installments.ts";

export const dynamic = "force-dynamic";

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));
  const rawIds = input.list("transactionIds", { min: 2, max: 48 });
  const transactionIds = rawIds.map((value, index) => {
    if (typeof value !== "string" || !value.trim() || value.length > 64) {
      input.reject(`transactionIds.${index}`, "Identificador inválido");
      return "";
    }
    return value;
  });
  const payload = {
    transactionIds,
    description: input.string("description", { max: 160 }),
    categoryId: input.optionalReference("categoryId"),
  };
  input.done();

  if (new Set(transactionIds).size !== transactionIds.length) {
    throw validationError("Há lançamentos repetidos", [
      { path: "transactionIds", message: "Selecione cada lançamento uma vez" },
    ]);
  }

  return json({ data: await groupTransactionsIntoInstallmentPlan(user.id, payload) }, { status: 201 });
});
