/**
 * `GET  /api/v1/clients` — clientes do usuário.
 * `POST /api/v1/clients` — cadastra um cliente.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { createClient, listClients } from "../../../../server/services/work.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const rows = await listClients(user.id);

  return json({
    data: rows.map((cliente) => ({
      id: cliente.id,
      name: cliente.name,
      contactName: cliente.contactName,
      email: cliente.email,
      phone: cliente.phone,
      color: cliente.color,
    })),
  });
});

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const payload = {
    name: input.string("name", { max: 80 }),
    contactName: input.optionalString("contactName", { max: 80 }),
    email: input.optionalString("email", { max: 160 }),
    phone: input.optionalString("phone", { max: 40 }),
    document: input.optionalString("document", { max: 40 }),
    notes: input.optionalString("notes", { max: 1000 }),
    color: input.optionalString("color", { max: 9 }),
  };
  input.done();

  const id = await createClient(user.id, payload);
  return json({ data: { id } }, { status: 201 });
});
