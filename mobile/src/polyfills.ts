/**
 * O que o Hermes não traz e o domínio precisa.
 *
 * `newId()` gera ULID a partir de `crypto.getRandomValues`, que existe no
 * Worker e no Node mas não no motor JavaScript do Android. Sem isto, criar um
 * lançamento offline falharia — e falharia dentro do domínio, longe da causa.
 *
 * Este módulo é importado primeiro em `index.ts`, e é por isso que ele é um
 * módulo separado: `import` é içado, então o efeito colateral precisa estar
 * num arquivo que o carregador avalie antes dos outros.
 */

import { getRandomValues } from "expo-crypto";

type RandomFiller = <T extends ArrayBufferView | null>(array: T) => T;

const atual = (globalThis as { crypto?: Partial<Crypto> }).crypto;

if (!atual) {
  Object.defineProperty(globalThis, "crypto", {
    value: { getRandomValues: getRandomValues as RandomFiller },
    configurable: true,
    writable: true,
  });
} else if (typeof atual.getRandomValues !== "function") {
  Object.defineProperty(atual, "getRandomValues", {
    value: getRandomValues as RandomFiller,
    configurable: true,
    writable: true,
  });
}
