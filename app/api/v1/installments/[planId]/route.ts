/** Edita ou desfaz a organização de um parcelamento, sem tocar em outros planos. */

import { requireUser } from "../../../../../server/auth/session.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, noContent, readJson } from "../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../server/http/route-params.ts";
import { ungroupInstallmentPlan, updateInstallmentPlan } from "../../../../../server/services/installments.ts";

export const dynamic = "force-dynamic";

function planIdOf(request: Request): string {
  return segmentAfter(request, "installments");
}

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));
  const setCategory = input.provided("categoryId");

  const payload = {
    description: input.optionalString("description", { max: 160 }),
    totalAmount: input.optionalMoney("totalAmount"),
    categoryId: input.optionalReference("categoryId"),
    setCategory,
  };
  input.done();

  await updateInstallmentPlan(user.id, planIdOf(request), payload);
  return json({ data: { ok: true } });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  await ungroupInstallmentPlan(user.id, planIdOf(request));
  return noContent();
});
