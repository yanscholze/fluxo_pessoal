/**
 * `app.json` guarda o que é declarativo; aqui entra só o que precisa de código.
 *
 * O plugin do listener de notificações não cabe em JSON: ele copia fontes
 * Kotlin e edita o `AndroidManifest`. Ver `plugins/with-notification-listener.cjs`.
 *
 * O da assinatura também não: ele lê a chave de `chaves/`, que fica fora do
 * git, e só age quando ela existe. Ver `plugins/with-assinatura-release.cjs`.
 *
 * O último tira do release o cliente de desenvolvimento, que o autolink
 * incluiria em toda variante. Ver `plugins/with-release-sem-cliente-dev.cjs`.
 * O que de fato decide o tamanho do APK não está aqui: é o corte das
 * arquiteturas nativas, que precisa ser feito na linha de comando do Gradle e
 * mora em `scripts/apk-local.sh`, com o porquê escrito lá.
 */

import base from "./app.json" with { type: "json" };

export default {
  ...base.expo,
  plugins: [
    ...(base.expo.plugins ?? []),
    "./plugins/with-notification-listener.cjs",
    "./plugins/with-assinatura-release.cjs",
    "./plugins/with-release-sem-cliente-dev.cjs",
  ],
};
