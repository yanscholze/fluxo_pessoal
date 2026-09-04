/**
 * Segmento de rota a partir da URL.
 *
 * As rotas com parâmetro precisam do identificador que veio no caminho, e cada
 * uma vinha recortando a URL por conta própria. Uma função só, com o nome do
 * recurso, evita que a próxima rota copie o recorte com um índice errado.
 */

import { validationError } from "../../core/kernel/errors.ts";

/**
 * Devolve o segmento imediatamente após `recurso`.
 *
 * Lança em vez de devolver vazio: um identificador ausente vira consulta por
 * string vazia, que não acha nada e responde "não encontrado" — escondendo que
 * o problema era a rota, não o dado.
 */
export function segmentAfter(request: Request, recurso: string): string {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const posicao = segments.indexOf(recurso);
  const valor = posicao === -1 ? "" : (segments[posicao + 1] ?? "");

  if (!valor) {
    throw validationError("Identificador ausente no caminho", [
      { path: recurso, message: "A rota exige um identificador" },
    ]);
  }

  return decodeURIComponent(valor);
}
