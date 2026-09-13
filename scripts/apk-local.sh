#!/usr/bin/env bash
#
# Gera o APK de instalação localmente, sem a nuvem da Expo.
#
# Existe porque o build local do Android depende de quatro variáveis de
# ambiente, e errar qualquer uma delas custa de dez a vinte minutos até a
# mensagem de erro aparecer. Três são caminho; a quarta é o motivo deste
# arquivo existir:
#
# **JAVA_HOME tem de apontar para um JDK 17.**
#
# No JDK 24 em diante, chamar `System.load` passou a ser método restrito e a
# JVM imprime um aviso em `stderr`. O gerador de prefabs do Android (a
# ferramenta que extrai os cabeçalhos nativos de fbjni, ReactAndroid e Hermes
# para o CMake) usa JNA, que chama exatamente isso — e o plugin do Gradle trata
# **qualquer** linha em `stderr` daquela ferramenta como erro fatal. O resultado
# é um build que morre em `configureCMakeRelWithDebInfo` dizendo
# "A restricted method in java.lang.System has been called", que não parece nem
# de longe com "seu Java é novo demais".
#
# A ferramenta em si funciona: roda, termina com código 0 e escreve o que devia.
# É só o aviso que derruba tudo. Num JDK 17 ele não existe, e o `stderr` volta a
# ser vazio.
#
# Uso: bash scripts/apk-local.sh [caminho-de-saída]
set -euo pipefail

SAIDA="${1:-$HOME/Downloads/fluxo.apk}"
JDK="${FLUXO_JDK_17:-$HOME/.jdks/jdk-17}"
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
# Fora de /tmp: o build escreve alguns gigabytes, e /tmp aqui é tmpfs com cota.
CACHE="${FLUXO_BUILD_CACHE:-$HOME/.cache/fluxo-build}"

if [[ ! -x "$JDK/bin/java" ]]; then
  echo "JDK 17 não encontrado em $JDK." >&2
  echo "Aponte FLUXO_JDK_17 para um JDK 17 (o build falha silenciosamente no 24+)." >&2
  exit 1
fi

if [[ ! -d "$SDK" ]]; then
  echo "Android SDK não encontrado em $SDK. Defina ANDROID_HOME." >&2
  exit 1
fi

mkdir -p "$CACHE"

export JAVA_HOME="$JDK"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export TMPDIR="$CACHE"
export GRADLE_USER_HOME="$CACHE/gradle"

cd "$(dirname "${BASH_SOURCE[0]}")/../mobile"

echo "JDK:    $("$JAVA_HOME/bin/java" -version 2>&1 | head -1)"
echo "SDK:    $ANDROID_HOME"
echo "saída:  $SAIDA"
echo

npx eas-cli build --platform android --profile preview --local --non-interactive --output "$SAIDA"
