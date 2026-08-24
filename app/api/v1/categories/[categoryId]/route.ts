/**
 * `PATCH  /api/v1/categories/:id` — renomeia, recolore ou muda os sinalizadores.
 * `DELETE /api/v1/categories/:id` — remove, ou arquiva se já houver histórico.
 *
 * Renomear é um `UPDATE` numa linha: os lançamentos apontam para o id, não
 * para o nome.
 */

import { and, eq } from "drizzle-orm";

import { notFound } from "../../../../../core/kernel/errors.ts";
import { requireUser } from "../../../../../server/auth/session.ts";
import { getDatabase } from "../../../../../server/db/client.ts";
import { categories } from "../../../../../server/db/schema/index.ts";
import { read } from "../../../../../server/http/input.ts";
import { handle, json, noContent, readJson } from "../../../../../server/http/respond.ts";
import { archiveCategory } from "../../../../../server/services/catalog.ts";

export const dynamic = "force-dynamic";

function categoryIdOf(request: Request): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  return segments[segments.indexOf("categories") + 1] ?? "";
}

export const PATCH = handle(async (request: Request) => {
  const user = await requireUser(request);
  const categoryId = categoryIdOf(request);
  const input = read(await readJson(request));

  const name = input.optionalString("name", { max: 60 });
  const color = input.optionalString("color", { max: 9 });
  const icon = input.optionalString("icon", { max: 40 });
  const isEssential = input.optionalChoice("isEssential", ["true", "false"] as const);
  const excludeFromFreeToSpend = input.optionalChoice("excludeFromFreeToSpend", ["true", "false"] as const);

  input.done();

  const database = getDatabase();
  const [existing] = await database
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .where(and(eq(categories.userId, user.id), eq(categories.id, categoryId)))
    .limit(1);
  if (!existing) throw notFound("Categoria", categoryId);

  await database
    .update(categories)
    .set({
      ...(name ? { name } : {}),
      ...(color ? { color } : {}),
      ...(icon ? { icon } : {}),
      // "Essencial" só faz sentido em saída: é o que alimenta a reserva.
      ...(isEssential !== null ? { isEssential: isEssential === "true" && existing.kind === "expense" } : {}),
      ...(excludeFromFreeToSpend !== null
        ? { excludeFromFreeToSpend: excludeFromFreeToSpend === "true" }
        : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(categories.userId, user.id), eq(categories.id, categoryId)));

  return json({ data: { ok: true } });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  await archiveCategory(user.id, categoryIdOf(request));
  return noContent();
});
