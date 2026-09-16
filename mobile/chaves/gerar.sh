#!/usr/bin/env bash
# Cria a chave de assinatura do APK, uma vez só.
#
# A chave decide se uma versão nova consegue se instalar por cima da anterior.
# Perdê-la significa ter de desinstalar o aplicativo (e reconectar o aparelho)
# em toda máquina onde ele estiver. Faça cópia de segurança dos dois arquivos
# desta pasta — eles não vão para o git, de propósito.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ -f fluxo-release.jks ]]; then
  echo "A chave já existe. Apagar e recriar invalida os APKs já instalados." >&2
  exit 0
fi

KEYTOOL="${FLUXO_JDK_17:-$HOME/.jdks/jdk-17}/bin/keytool"
SENHA="$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | head -c 28)"

"$KEYTOOL" -genkeypair -v \
  -keystore fluxo-release.jks \
  -alias fluxo \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storepass "$SENHA" -keypass "$SENHA" \
  -dname "CN=Fluxo, OU=Fluxo, O=Fluxo, L=Sao Paulo, ST=SP, C=BR"

{
  echo "FLUXO_STORE_FILE=$(pwd)/fluxo-release.jks"
  echo "FLUXO_STORE_PASSWORD=$SENHA"
  echo "FLUXO_KEY_ALIAS=fluxo"
  echo "FLUXO_KEY_PASSWORD=$SENHA"
} > assinatura.properties

chmod 600 assinatura.properties fluxo-release.jks
echo "Chave criada. Guarde chaves/fluxo-release.jks e chaves/assinatura.properties."
