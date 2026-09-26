/**
 * Assinatura de release, sem a nuvem da Expo.
 *
 * O modelo que o `expo prebuild` gera assina o release com a **chave de
 * depuração** — a mesma que acompanha o template e é pública. Serve para
 * instalar no próprio aparelho e não serve para mais nada: qualquer pessoa
 * consegue assinar um APK com ela e trocar o aplicativo instalado.
 *
 * Este plugin substitui isso pela chave própria do projeto, guardada em
 * `mobile/chaves/` e fora do git. Quando o arquivo de propriedades não existe —
 * numa cópia recém-clonada, ou na máquina de outra pessoa — o plugin não faz
 * nada, e o build continua saindo com a chave de depuração em vez de falhar.
 * Quebrar o `prebuild` de quem só quer rodar o aplicativo seria pior do que
 * assinar mal um APK que ninguém vai distribuir.
 *
 * A configuração precisa ser um plugin, e não uma edição em `android/`, porque
 * `android/` é gerado: todo `prebuild` reescreve o que estiver lá.
 */

const fs = require("node:fs");
const path = require("node:path");
const { withAppBuildGradle } = require("@expo/config-plugins");

const ARQUIVO_DE_CHAVES = path.join(__dirname, "..", "chaves", "assinatura.properties");

/** Lê o arquivo de propriedades, se ele existir. */
function lerAssinatura() {
  if (!fs.existsSync(ARQUIVO_DE_CHAVES)) return null;

  const propriedades = Object.fromEntries(
    fs
      .readFileSync(ARQUIVO_DE_CHAVES, "utf8")
      .split("\n")
      .map((linha) => linha.trim())
      .filter((linha) => linha && !linha.startsWith("#"))
      .map((linha) => {
        const corte = linha.indexOf("=");
        return [linha.slice(0, corte), linha.slice(corte + 1)];
      }),
  );

  const faltando = ["FLUXO_STORE_FILE", "FLUXO_STORE_PASSWORD", "FLUXO_KEY_ALIAS", "FLUXO_KEY_PASSWORD"]
    .filter((chave) => !propriedades[chave]);

  if (faltando.length) {
    throw new Error(
      `chaves/assinatura.properties existe mas está incompleto: falta ${faltando.join(", ")}`,
    );
  }

  if (!fs.existsSync(propriedades.FLUXO_STORE_FILE)) {
    throw new Error(`a chave apontada não existe: ${propriedades.FLUXO_STORE_FILE}`);
  }

  return propriedades;
}

module.exports = function withAssinaturaRelease(config) {
  return withAppBuildGradle(config, (mod) => {
    const assinatura = lerAssinatura();
    if (!assinatura) return mod;

    let gradle = mod.modResults.contents;

    // Idempotente: `prebuild` roda de novo sobre um arquivo já modificado.
    if (gradle.includes("fluxoRelease")) return mod;

    const bloco = [
      "        fluxoRelease {",
      `            storeFile file('${assinatura.FLUXO_STORE_FILE}')`,
      `            storePassword '${assinatura.FLUXO_STORE_PASSWORD}'`,
      `            keyAlias '${assinatura.FLUXO_KEY_ALIAS}'`,
      `            keyPassword '${assinatura.FLUXO_KEY_PASSWORD}'`,
      "        }",
    ].join("\n");

    gradle = gradle.replace(/(signingConfigs\s*\{)/, `$1\n${bloco}`);

    /*
     * Só a variante de release troca de chave. A de debug continua com a chave
     * de depuração — é ela que permite instalar as duas lado a lado enquanto se
     * desenvolve.
     */
    gradle = gradle.replace(
      /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig signingConfigs.fluxoRelease",
    );

    if (!gradle.includes("signingConfigs.fluxoRelease")) {
      throw new Error("não encontrei onde trocar a assinatura do release no build.gradle");
    }

    mod.modResults.contents = gradle;
    return mod;
  });
};
