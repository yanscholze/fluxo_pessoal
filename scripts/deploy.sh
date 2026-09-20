#!/usr/bin/env bash
#
# Publicação na Cloudflare.
#
# O `vite.config.ts` monta a configuração do Worker no momento do build, e o
# `database_id` do D1 sai de `CLOUDFLARE_D1_DATABASE_ID`. Sem a variável ele
# cai num id de espaço reservado — `00000000-...` —, e aí acontece uma de duas
# coisas:
#
#   1. o deploy falha com "database not found", que é chato mas inofensivo; ou
#   2. o id existe na conta e **o Fluxo passa a ler outro banco**.
#
# O segundo caso é o que este arquivo existe para impedir. Publicar apontando
# para o banco errado não quebra nada de forma visível: a tela abre, o login
# funciona, e os números simplesmente são de outra pessoa.
#
# Por isso o id não é digitado à mão nem guardado aqui: ele é perguntado à
# Cloudflare, pelo nome do banco de produção. E se a resposta não vier, o
# script para antes de construir qualquer coisa.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

# O banco de produção do Fluxo. É o que o Worker publicado usa hoje — dá para
# conferir com `wrangler versions view <id> --name fluxo-pessoal`, que imprime
# o uuid da ligação `env.DB`.
BANCO="${FLUXO_D1_NAME:-fluxo-pessoal-app}"

if [[ -z "${CLOUDFLARE_D1_DATABASE_ID:-}" ]]; then
  echo "Procurando o banco '${BANCO}' na conta..."
  CLOUDFLARE_D1_DATABASE_ID="$(
    npx wrangler d1 list --json 2>/dev/null |
      node -e '
        const bancos = JSON.parse(require("fs").readFileSync(0, "utf8"));
        const alvo = bancos.find((banco) => banco.name === process.argv[1]);
        if (alvo) process.stdout.write(alvo.uuid);
      ' "${BANCO}"
  )"
fi

if [[ -z "${CLOUDFLARE_D1_DATABASE_ID}" || "${CLOUDFLARE_D1_DATABASE_ID}" == 00000000-* ]]; then
  echo "Não foi possível resolver o id do banco '${BANCO}'." >&2
  echo "Confira se o wrangler está autenticado (npx wrangler whoami) ou passe" >&2
  echo "CLOUDFLARE_D1_DATABASE_ID=<uuid> na frente do comando." >&2
  exit 78
fi

export CLOUDFLARE_D1_DATABASE_ID
echo "Banco de produção: ${BANCO} (${CLOUDFLARE_D1_DATABASE_ID})"

"${script_dir}/build-verified.sh"

# Última conferência antes de subir: o artefato tem de carregar o id que
# acabamos de resolver, e não o de espaço reservado.
gerado="$(node -e '
  const config = require("fs").readFileSync("dist/server/wrangler.json", "utf8");
  process.stdout.write(JSON.parse(config).d1_databases?.[0]?.database_id ?? "");
')"

if [[ "${gerado}" != "${CLOUDFLARE_D1_DATABASE_ID}" ]]; then
  echo "O artefato saiu com database_id '${gerado}', e não '${CLOUDFLARE_D1_DATABASE_ID}'." >&2
  exit 70
fi

npx wrangler deploy --config dist/server/wrangler.json
