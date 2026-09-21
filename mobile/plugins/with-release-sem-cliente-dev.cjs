/**
 * O cliente de desenvolvimento fica fora do APK de release.
 *
 * `expo-dev-client` está nas devDependencies porque o aplicativo não roda no
 * Expo Go — o listener de notificações é módulo nativo, e o Expo Go não o
 * contém. Só que "devDependency" é categoria do npm e não do Gradle: o
 * autolink da Expo enxerga o pacote instalado e o compila em toda variante.
 * O release saía com `expo-dev-launcher`, `expo-dev-menu` e
 * `expo-dev-menu-interface` dentro: o menu que abre ao sacudir o aparelho, a
 * tela de escolher para qual servidor de desenvolvimento apontar, o inspetor
 * de rede.
 *
 * O motivo de tirar não é tamanho. Medido nos dois APKs, o cliente de
 * desenvolvimento pesa 382 KB — o que engorda o arquivo são as arquiteturas
 * nativas, e disso cuida `scripts/apk-local.sh`. O motivo é que um APK
 * assinado de release não devia carregar um carregador capaz de apontar o
 * aplicativo para outro servidor, nem um inspetor do tráfego de quem o
 * instalou. Se um dia o custo desta condição parecer maior do que o incômodo,
 * é uma linha para apagar, e o APK cresce 382 KB.
 *
 * `expoAutolinking.exclude`, no `settings.gradle`, é o lugar onde se tira um
 * pacote do autolink — e é o único lugar, porque a lista de módulos é
 * resolvida ali, uma vez por chamada do Gradle, e o resto do build (inclusive
 * a geração do `ExpoModulesPackageList`) só lê o resultado.
 *
 * Isso é antes de existir variante: no `settings.gradle` ainda não há debug
 * nem release, então a única coisa que dá para perguntar é qual tarefa foi
 * pedida na linha de comando. Daí a leitura de `startParameter.taskNames`.
 * Quem pede release, e só release — `bash scripts/apk-local.sh`, que chama
 * `gradlew assembleRelease` — compila sem o cliente de desenvolvimento.
 * `npm run android`, que pede `assembleDebug`, continua compilando com ele.
 *
 * `@expo/log-box` fica. Ele aparece na mesma lista do autolink e parece da
 * mesma família, mas é dependência do próprio `expo`, é a tela que aparece
 * quando o JavaScript estoura, e o diretório android dele tem 44 KB: tirar
 * não encolheria nada e tiraria justamente o que ainda funciona quando o
 * resto quebrou.
 *
 * Como `android/` é gerado, isto é um plugin, e não uma edição no Gradle:
 * todo `prebuild` reescreve o que estiver lá.
 */

const { withSettingsGradle } = require("@expo/config-plugins");

/** Os quatro pacotes do cliente de desenvolvimento. Nenhum outro módulo depende deles. */
const PACOTES = [
  "expo-dev-client",
  "expo-dev-launcher",
  "expo-dev-menu",
  "expo-dev-menu-interface",
];

/** A chamada que o modelo do `prebuild` gera, e onde o bloco entra. */
const CHAMADA = "expoAutolinking.useExpoModules()";

/** Serve de marca de idempotência: `prebuild` roda de novo sobre um arquivo já modificado. */
const MARCA = "// fluxo: o release não leva o cliente de desenvolvimento";

module.exports = function withReleaseSemClienteDev(config) {
  return withSettingsGradle(config, (mod) => {
    const settings = mod.modResults.contents;
    if (settings.includes(MARCA)) return mod;

    if (!settings.includes(CHAMADA)) {
      throw new Error(`não encontrei '${CHAMADA}' no settings.gradle gerado`);
    }

    const bloco = [
      MARCA,
      "def tarefasPedidas = gradle.startParameter.taskNames.join(' ')",
      "if (tarefasPedidas.contains('Release') && !tarefasPedidas.contains('Debug')) {",
      `  expoAutolinking.exclude = [${PACOTES.map((pacote) => `'${pacote}'`).join(", ")}]`,
      "}",
      CHAMADA,
    ].join("\n");

    mod.modResults.contents = settings.replace(CHAMADA, bloco);
    return mod;
  });
};
