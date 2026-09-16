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
# Uso: bash scripts/apk-local.sh [caminho-de-saída] [--limpo]
set -euo pipefail

SAIDA="${1:-$HOME/Downloads/fluxo.apk}"
[[ "${1:-}" == "--limpo" ]] && SAIDA="$HOME/Downloads/fluxo.apk"
LIMPO=""
for argumento in "$@"; do [[ "$argumento" == "--limpo" ]] && LIMPO="--clean"; done

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JDK="${FLUXO_JDK_17:-$HOME/.jdks/jdk-17}"
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
CACHE="${FLUXO_BUILD_CACHE:-$HOME/.cache/fluxo-build}"

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

echo "→ compilando (gradlew assembleRelease)"
cd "$RAIZ/mobile/android"
./gradlew assembleRelease --no-daemon

APK="$RAIZ/mobile/android/app/build/outputs/apk/release/app-release.apk"
[[ -f "$APK" ]] || { echo "o Gradle terminou mas não achei o APK em $APK" >&2; exit 1; }

mkdir -p "$(dirname "$SAIDA")"
cp "$APK" "$SAIDA"

echo
echo "APK: $SAIDA"
"$SDK"/build-tools/*/aapt dump badging "$SAIDA" 2>/dev/null | head -1 || true
