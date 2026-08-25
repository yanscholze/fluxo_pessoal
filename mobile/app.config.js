/**
 * `app.json` guarda o que é declarativo; aqui entra só o que precisa de código.
 *
 * O plugin do listener de notificações não cabe em JSON: ele copia fontes
 * Kotlin e edita o `AndroidManifest`. Ver `plugins/with-notification-listener.cjs`.
 */

import base from "./app.json" with { type: "json" };

export default {
  ...base.expo,
  plugins: [...(base.expo.plugins ?? []), "./plugins/with-notification-listener.cjs"],
};
