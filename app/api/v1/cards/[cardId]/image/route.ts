/**
 * `GET /api/v1/cards/:id/image` — devolve a foto do cartão.
 * `PUT` — troca a foto. `DELETE` — remove.
 *
 * A imagem vem por rota própria, e não dentro da listagem de cartões, porque a
 * listagem é carregada a cada abertura do painel e do aplicativo. Base64 de
 * cinco cartões dentro dela seria quase um megabyte trafegado para desenhar
 * cinco retângulos.
 *
 * A resposta é privada e revalidável: o caminho gravado em `cards.imageUrl`
 * carrega o carimbo da última troca, então o cliente pode guardar a imagem sem
 * o risco de continuar mostrando a antiga depois que ela muda.
 */

import { requireUser } from "../../../../../../server/auth/session.ts";
import { read } from "../../../../../../server/http/input.ts";
import { handle, json, readJson } from "../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../server/http/route-params.ts";
import { findCardImage, removeCardImage, setCardImage } from "../../../../../../server/services/catalog.ts";

export const dynamic = "force-dynamic";

/** Um ano: o caminho muda quando a foto muda, então o cache nunca fica velho. */
const CACHE = "private, max-age=31536000, immutable";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const cardId = segmentAfter(request, "cards");

  const imagem = await findCardImage(user.id, cardId);
  if (!imagem) return new Response(null, { status: 404 });

  return new Response(imagem.content as unknown as BodyInit, {
    headers: {
      "content-type": imagem.contentType,
      "content-length": String(imagem.content.length),
      "cache-control": CACHE,
    },
  });
});

export const PUT = handle(async (request: Request) => {
  const user = await requireUser(request);
  const cardId = segmentAfter(request, "cards");

  const input = read(await readJson(request));
  const dataUrl = input.string("dataUrl", { max: 700_000 });
  input.done();

  await setCardImage(user.id, cardId, dataUrl);
  return json({ data: { ok: true } });
});

export const DELETE = handle(async (request: Request) => {
  const user = await requireUser(request);
  await removeCardImage(user.id, segmentAfter(request, "cards"));
  return json({ data: { ok: true } });
});
