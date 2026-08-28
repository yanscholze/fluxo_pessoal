/**
 * Configuração do Metro.
 *
 * Resolve três coisas.
 *
 * **1. `core/` é um pacote, não um diretório vizinho.** Domínio, dinheiro,
 * datas e ciclo de fatura ficam na raiz do repositório, e o aplicativo os
 * consome como `@fluxo/core`. Sem isso a regra teria que ser reescrita aqui,
 * que é o que a versão anterior fazia e por que o site e o celular divergiam.
 *
 * **2. O repositório é um workspace npm.** Isso não é preferência de
 * organização: é o que a EAS usa para detectar o monorepo e enviar `core/`
 * junto no build. Sem o campo `workspaces`, a EAS empacota só `mobile/`, e o
 * `npm install` no servidor dela quebra procurando `../core`.
 *
 * Como consequência, as dependências do aplicativo são içadas para o
 * `node_modules` da raiz — daí `nodeModulesPaths` listar os dois lugares, na
 * ordem em que devem ser procurados.
 *
 * **3. Este repositório escreve a extensão nos imports.** `./foo.ts`, e não
 * `./foo`. É exigência do executor de testes do Node (`--experimental-strip-
 * types`) e vale para `core/` e para o aplicativo igualmente. O resolvedor do
 * Metro não fala esse dialeto nos caminhos relativos, então a tradução acontece
 * aqui, num lugar só.
 */

const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repositoryRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [repositoryRoot];

config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(repositoryRoot, "node_modules"),
];

/** `./x.ts` e `./x.tsx` viram `./x`, que é o que o Metro sabe resolver. */
const RELATIVE_TYPESCRIPT = /^(\.{1,2}\/.*)\.(ts|tsx)$/;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const relativo = RELATIVE_TYPESCRIPT.exec(moduleName);
  return context.resolveRequest(context, relativo ? relativo[1] : moduleName, platform);
};

module.exports = config;
