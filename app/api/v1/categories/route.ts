/**
 * `GET /api/v1/categories` — categorias do usuário.
 * `POST /api/v1/categories` — cadastra uma categoria.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { listCategories } from "../../../../server/repositories/catalog.ts";
import { createCategory } from "../../../../server/services/catalog.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  return json({ data: await listCategories(user.id) });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const payload = {
    name: input.string("name", { max: 60 }),
    kind: input.choice("kind", ["expense", "income"] as const),
    parentId: input.optionalReference("parentId"),
    color: input.optionalString("color", { max: 9 }),
    icon: input.optionalString("icon", { max: 40 }),
    isEssential: input.boolean("isEssential", false),
    excludeFromFreeToSpend: input.boolean("excludeFromFreeToSpend", false),
  };

  input.done();

  const id = await createCategory(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
