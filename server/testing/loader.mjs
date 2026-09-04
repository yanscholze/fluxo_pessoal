/**
 * Carregador dos testes de serviço.
 *
 * Resolve dois especificadores que só existem dentro do Worker:
 *
 * - `cloudflare:workers` — o binding do D1, que aqui vem de `worker-env.ts`.
 * - `*.sql?raw` — as migrations, que o Vite embute como texto no build e que
 *   no Node precisam ser lidas do disco.
 *
 * Fica no carregador de propósito. Fazer o código de produção detectar "estou
 * num teste?" é o começo de uma segunda implementação escondida atrás de um
 * `if`, e aí o que roda em produção deixa de ser o que foi testado.
 */

import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SUBSTITUTO_WORKERS = pathToFileURL(join(AQUI, "worker-env.ts")).href;

registerHooks({
  resolve(especificador, contexto, proximo) {
    if (especificador === "cloudflare:workers") {
      return { url: SUBSTITUTO_WORKERS, shortCircuit: true };
    }

    if (especificador.endsWith(".sql?raw")) {
      const caminho = especificador.slice(0, -"?raw".length);
      const base = contexto.parentURL ? dirname(fileURLToPath(contexto.parentURL)) : AQUI;
      const absoluto = caminho.startsWith(".") ? join(base, caminho) : caminho;
      return { url: `${pathToFileURL(absoluto).href}?raw`, shortCircuit: true };
    }

    return proximo(especificador, contexto);
  },

  load(url, contexto, proximo) {
    if (url.endsWith(".sql?raw")) {
      const texto = readFileSync(fileURLToPath(url.slice(0, -"?raw".length)), "utf8");
      return {
        format: "module",
        shortCircuit: true,
        source: `export default ${JSON.stringify(texto)};`,
      };
    }

    return proximo(url, contexto);
  },
});
