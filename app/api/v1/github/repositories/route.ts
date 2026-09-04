/**
 * `GET /api/v1/github/repositories` — os repositórios que o token alcança.
 *
 * Serve para vincular um projeto escolhendo de uma lista em vez de colar uma
 * URL. Colar erra — erra o dono, erra o hífen, erra o repositório parecido — e
 * o erro só aparece depois, como "repositório não encontrado" numa tela que
 * deveria mostrar commits.
 *
 * Sem token, devolve lista vazia e diz que não está ligado: a tela continua
 * aceitando a URL digitada, que é o caminho que sempre existiu.
 */

import { requireUser } from "../../../../../server/auth/session.ts";
import { handle, json } from "../../../../../server/http/respond.ts";
import { isConfigured, listRepositories } from "../../../../../server/services/github.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  await requireUser(request);

  const repositorios = await listRepositories();

  return json({
    data: {
      configured: isConfigured(),
      // `null` do serviço significa "não deu para consultar" — sem token, ou
      // token que o GitHub recusou. A tela distingue pelos dois campos.
      available: repositorios !== null,
      repositories: repositorios ?? [],
    },
  });
});
