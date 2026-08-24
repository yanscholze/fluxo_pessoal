/**
 * `POST /api/v1/receipts` — lê um cupom fiscal e devolve os campos do lançamento.
 *
 * Não grava nada: a saída volta para o formulário, o usuário confere e
 * confirma. Um OCR que grava sozinho transforma erro de leitura em erro de
 * saldo.
 */

import { requireUser } from "../../../../server/auth/session.ts";
import { read } from "../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../server/http/respond.ts";
import { readReceipt } from "../../../../server/services/ai/receipt.ts";

export const dynamic = "force-dynamic";

/** Base64 de uma foto de 6 MB cabe em ~8 MB de texto. */
const MAX_PAYLOAD = 9_000_000;

export const POST = handle(async (request: Request) => {
  const user = await requireUser(request);
  const input = read(await readJson(request));

  const imageDataUrl = input.string("image", { max: MAX_PAYLOAD });
  input.done();

  const { reading, remaining } = await readReceipt(user.id, { imageDataUrl });
  return json({ data: { ...reading, remaining } });
});
