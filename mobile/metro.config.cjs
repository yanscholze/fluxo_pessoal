/**
 * Configuração do Metro.
 *
 * Resolve duas coisas.
 *
 * **1. `core/` é um pacote, não um diretório vizinho.** Domínio, dinheiro,
 * datas e ciclo de fatura ficam na raiz do repositório, e o aplicativo os
 * consome como `@fluxo/core` — uma dependência `file:../core`, que o npm
 * materializa como link em `node_modules`. Sem isso a regra teria que ser
 * reescrita aqui, que é o que a versão anterior fazia e por que o site e o
 * celular divergiam. `watchFolders` completa o arranjo: é o que faz o Metro
 * recarregar quando o domínio muda, em vez de servir a versão em cache.
 *
 * **2. Este repositório escreve a extensão nos imports.** `./foo.ts`, e não
 * `./foo`. É exigência do executor de testes do Node (`--experimental-strip-
 * types`) e vale para `core/` e para o aplicativo igualmente. O resolvedor do
 * Metro não fala esse dialeto nos caminhos relativos: ele espera o
 * especificador sem extensão e tenta as suas próprias. A tradução acontece
 * aqui, num lugar só, em vez de o aplicativo manter uma convenção de import
 * diferente da do resto do projeto.
 */

const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repositoryRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(repositoryRoot, "core")];

/** `./x.ts` e `./x.tsx` viram `./x`, que é o que o Metro sabe resolver. */
const RELATIVE_TYPESCRIPT = /^(\.{1,2}\/.*)\.(ts|tsx)$/;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const relativo = RELATIVE_TYPESCRIPT.exec(moduleName);
  return context.resolveRequest(context, relativo ? relativo[1] : moduleName, platform);
};

module.exports = config;
