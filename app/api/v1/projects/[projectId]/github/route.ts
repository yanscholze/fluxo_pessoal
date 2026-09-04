/**
 * `GET /api/v1/projects/:id/github` — atividade do repositório do projeto.
 *
 * Rota separada, e não parte da página, porque depende de rede externa: a tela
 * do projeto precisa abrir mesmo com o GitHub fora do ar.
 */

import { requireUser } from "../../../../../../server/auth/session.ts";
import { handle, json } from "../../../../../../server/http/respond.ts";
import { segmentAfter } from "../../../../../../server/http/route-params.ts";
import { repositoryActivity } from "../../../../../../server/services/github.ts";
import { findProject } from "../../../../../../server/services/work.ts";
import { notFound } from "../../../../../../core/kernel/errors.ts";

export const dynamic = "force-dynamic";

export const GET = handle(async (request: Request) => {
  const user = await requireUser(request);
  const projectId = segmentAfter(request, "projects");

  const projeto = await findProject(user.id, projectId);
  if (!projeto) throw notFound("Projeto", projectId);

  const atividade = await repositoryActivity(projeto.repositoryUrl, projeto.mainBranch);
  return json({ data: atividade });
});
