/**
 * Leitura de `data:` URL.
 *
 * O aplicativo e o site mandam arquivo dentro de JSON, em base64, porque é o
 * formato que a câmera e o seletor de arquivos entregam sem precisar de
 * `multipart` nem de um segundo pedido. O servidor precisa dos bytes.
 *
 * Vive no núcleo porque é função pura de texto para bytes, sem dependência de
 * ambiente — e porque a mesma leitura serve para documento de projeto, cupom e
 * foto de cartão. Cada cópia dela era uma chance a mais de aceitar um formato
 * que as outras recusam.
 */

/** O que impediu a leitura. Quem chama decide como isso vira erro de borda. */
export type DataUrlProblem = "formato" | "tipo-divergente" | "base64-invalido";

export type DataUrlResult =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly contentType: string }
  | { readonly ok: false; readonly problem: DataUrlProblem };

const MARCADOR = ";base64,";

/**
 * Extrai os bytes de um `data:<tipo>;base64,<conteúdo>`.
 *
 * `expectedType`, quando informado, precisa bater com o tipo declarado no
 * cabeçalho. Divergência não é detalhe: significa que alguém montou o pedido à
 * mão, e não há como saber qual dos dois é o certo — gravar o arquivo com o
 * tipo errado o torna ilegível depois, sem nenhum aviso.
 */
export function bytesFromDataUrl(dataUrl: string, expectedType?: string): DataUrlResult {
  const corte = dataUrl.indexOf(MARCADOR);
  if (!dataUrl.startsWith("data:") || corte === -1) return { ok: false, problem: "formato" };

  const contentType = dataUrl.slice("data:".length, corte);
  if (expectedType !== undefined && contentType !== expectedType) {
    return { ok: false, problem: "tipo-divergente" };
  }

  let binario: string;
  try {
    binario = atob(dataUrl.slice(corte + MARCADOR.length));
  } catch {
    return { ok: false, problem: "base64-invalido" };
  }

  const bytes = new Uint8Array(binario.length);
  for (let indice = 0; indice < binario.length; indice += 1) {
    bytes[indice] = binario.charCodeAt(indice);
  }
  return { ok: true, bytes, contentType };
}
