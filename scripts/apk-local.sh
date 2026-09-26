#!/usr/bin/env bash
#
# Gera o APK de instalação no terminal, com Gradle, sem a nuvem da Expo.
#
# O caminho antigo passava pelo `eas build --local`, que baixava um plugin,
# copiava o projeto para uma pasta temporária, reinstalava tudo e só então
# chamava o Gradle. Funcionava, e escondia o build atrás de uma camada que
# falhava por conta própria — foi ela que quebrou quando a chave de assinatura
# remota ficou fora do alcance. Aqui o Gradle é chamado direto, no projeto que
# está no disco, e o que falha é o que se lê.
#
# Quatro variáveis precisam estar certas, e três delas já quebraram este build
# antes:
#
# JAVA_HOME — tem de ser um JDK 17. Do 24 em diante a JVM imprime um aviso ao
#   carregar biblioteca nativa; o gerador de prefabs do Android usa JNA, dispara
#   esse aviso, e o plugin do Gradle trata qualquer linha em `stderr` daquela
#   ferramenta como erro fatal. Morre em `configureCMakeRelWithDebInfo` dizendo
#   "A restricted method in java.lang.System has been called", que não sugere
#   em nada que o problema é a versão do Java.
#
# ANDROID_HOME — sem ele o Gradle para na avaliação do projeto com "SDK location
#   not found", antes de compilar qualquer coisa.
#
# TMPDIR — fora de /tmp, que aqui é tmpfs com cota e já encheu no meio de um
#   build, derrubando o shell junto.
#
# E as dependências: o bundle do JavaScript é montado pelo próprio Gradle, na
# tarefa `createBundleReleaseJsAndAssets`. Se faltar um pacote, é ali que o
# build morre — depois de dez minutos compilando código nativo que estava certo.
# Por isso a checagem vem antes.
#
# FLUXO_ARQUITETURAS — quais processadores o APK carrega. Ver o comentário
#   sobre `reactNativeArchitectures`, na chamada do Gradle.
#
# Uso: bash scripts/apk-local.sh [caminho-de-saída] [--limpo]
set -euo pipefail

SAIDA="${1:-$HOME/Downloads/fluxo.apk}"
[[ "${1:-}" == "--limpo" ]] && SAIDA="$HOME/Downloads/fluxo.apk"
# O script muda para mobile/android durante a compilação. Fixe a saída no
# diretório de onde foi chamado antes desse cd, inclusive para caminhos relativos.
SAIDA="$(realpath -m -- "$SAIDA")"
LIMPO=""
for argumento in "$@"; do [[ "$argumento" == "--limpo" ]] && LIMPO="--clean"; done

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JDK="${FLUXO_JDK_17:-$HOME/.jdks/jdk-17}"
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
CACHE="${FLUXO_BUILD_CACHE:-$HOME/.cache/fluxo-build}"
ARQUITETURAS="${FLUXO_ARQUITETURAS:-arm64-v8a,armeabi-v7a}"

if [[ ! -x "$JDK/bin/java" ]]; then
  echo "JDK 17 não encontrado em $JDK. Aponte FLUXO_JDK_17." >&2
  exit 1
fi

if [[ ! -d "$SDK/platform-tools" ]]; then
  echo "Android SDK não encontrado em $SDK. Defina ANDROID_HOME." >&2
  exit 1
fi

export JAVA_HOME="$JDK"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export TMPDIR="$CACHE"
export GRADLE_USER_HOME="$CACHE/gradle"
mkdir -p "$CACHE"

cd "$RAIZ"

# O `mobile` é workspace npm: as dependências dele ficam no node_modules da
# raiz. Instalar dentro de `mobile/` não resolve, e foi assim que um build
# gastou dez minutos para morrer em "Unable to resolve module".
if [[ ! -d node_modules/phosphor-react-native || ! -d node_modules/react-native ]]; then
  echo "→ instalando dependências (npm ci)"
  npm ci
fi

echo "→ gerando o projeto nativo (expo prebuild ${LIMPO:-incremental})"
cd "$RAIZ/mobile"
npx expo prebuild --platform android --no-install ${LIMPO:+--clean}

# `reactNativeArchitectures` decide quais bibliotecas nativas são compiladas e
# empacotadas. O `expo prebuild` escreve as quatro em `gradle.properties` —
# armeabi-v7a, arm64-v8a, x86 e x86_64 — e as duas últimas só existem para
# emulador. Num APK que vai para um telefone elas são 45 MB de peso morto: o
# release universal dava 103 MB, e sem elas dá 58 MB. Como as bibliotecas
# nativas vão descompactadas (`expo.useLegacyPackaging=false`), o que sai da
# lista sai inteiro do arquivo.
#
# O corte é aqui, na linha de comando, e não em `gradle.properties` nem num
# plugin de configuração, por dois motivos. Primeiro, `-P` é a única forma de
# valer só para este build: a propriedade é lida na configuração do projeto,
# antes de existir variante, então escrevê-la no arquivo cortaria também o
# build de desenvolvimento, que precisa das duas x86 para instalar em
# emulador. Segundo, é o único lugar que funciona: filtrar por variante com
# `packaging.jniLibs.excludes` deixa passar `libreactnative.so`,
# `libhermesvm.so` e as outras quatro que o plugin do React Native marca como
# `pickFirst` — e `pickFirst` ganha de `exclude`.
#
# Para enxugar mais, tire `armeabi-v7a` (mais 15 MB) depois de confirmar que o
# aparelho é 64 bits:
#
#     adb shell getprop ro.product.cpu.abilist
#
echo "→ compilando (gradlew assembleRelease, $ARQUITETURAS)"
cd "$RAIZ/mobile/android"
./gradlew assembleRelease --no-daemon -PreactNativeArchitectures="$ARQUITETURAS"

APK="$RAIZ/mobile/android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$APK" ]] || { echo "o Gradle terminou mas não achei o APK em $APK" >&2; exit 1; }

mkdir -p "$(dirname "$SAIDA")"
cp "$APK" "$SAIDA"

echo
echo "APK: $SAIDA ($(du -h "$SAIDA" | cut -f1))"

# O glob de `build-tools` casa com todas as versões instaladas, e passar duas
# para o shell vira `aapt35 aapt36 dump badging`, que falha calado. Fica a
# última, que é a mais nova.
FERRAMENTAS=("$SDK"/build-tools/*)
AAPT="${FERRAMENTAS[-1]}/aapt"

# Lido de uma vez, e não por `| head -1`: o `head` fecha o cano, o `aapt`
# morre de SIGPIPE, e com `pipefail` isso derruba o script inteiro depois de
# o APK já estar pronto.
if [[ -x "$AAPT" ]]; then
  BADGING="$("$AAPT" dump badging "$SAIDA")"
  sed -n "1p" <<< "$BADGING"
  echo "arquiteturas: $(sed -n "s/^native-code: //p" <<< "$BADGING")"
fi
