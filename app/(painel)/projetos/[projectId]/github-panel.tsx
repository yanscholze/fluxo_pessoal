"use client";

/**
 * O repositório do projeto.
 *
 * Os atalhos aparecem sempre — issues, pull requests, commits, actions — porque
 * só dependem do endereço que o usuário já cadastrou. A atividade é carregada
 * depois e pode não vir: o GitHub é rede externa, e a tela do projeto não pode
 * depender dele para abrir.
 *
 * Quando não há token de leitura no ambiente, o painel diz isso em vez de
 * fingir que o repositório está vazio.
 */

import { useEffect, useState } from "react";

import { parseGithubRepository, repositoryLinks } from "../../../../core/domain/work/repository.ts";
import type { RepositoryActivity } from "../../../../server/services/github.ts";
import { ExternalLink, Github } from "../../../ui/icons.tsx";
import { Badge, Empty, Panel, PanelHeader } from "../../../ui/primitives.tsx";

const MOTIVO: Record<string, string> = {
  "sem-token":
    "A leitura do GitHub não está ligada nesta instalação. Os atalhos acima continuam funcionando.",
  "sem-acesso":
    "O repositório não foi encontrado, ou o token não alcança ele. Repositório privado precisa de um token com acesso.",
  falhou: "Não foi possível falar com o GitHub agora.",
};

/** `há 3 h`, `há 2 dias` — a idade do commit importa mais que a data exata. */
function idade(iso: string): string {
  if (!iso) return "";
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutos < 60) return `há ${Math.max(1, minutos)} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

export function GithubPanel({
  projectId,
  repositoryUrl,
  mainBranch,
}: {
  projectId: string;
  repositoryUrl: string | null;
  mainBranch: string | null;
}) {
  const [atividade, setAtividade] = useState<RepositoryActivity | null>(null);
  const repo = parseGithubRepository(repositoryUrl);
  // O objeto é remontado a cada render; o que identifica o repositório é o
  // `slug`, e é ele que decide se a busca precisa acontecer de novo.
  const slug = repo?.slug ?? null;

  useEffect(() => {
    if (!slug) return;

    // `cancelado` evita escrever estado depois de trocar de projeto, o que
    // mostraria a atividade de um repositório na tela de outro.
    let cancelado = false;

    fetch(`/api/v1/projects/${projectId}/github`)
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .then((corpo) => {
        if (!cancelado) setAtividade((corpo?.data as RepositoryActivity) ?? { available: false, reason: "falhou" });
      })
      .catch(() => {
        if (!cancelado) setAtividade({ available: false, reason: "falhou" });
      });

    return () => {
      cancelado = true;
    };
  }, [projectId, slug]);

  if (!repo) {
    return (
      <Panel>
        <PanelHeader title="Repositório" icon={Github} />
        <Empty
          icon={Github}
          title="Nenhum repositório do GitHub"
          hint="Cadastre o endereço do repositório na ficha do projeto para ter os atalhos e a atividade aqui."
          compact
        />
      </Panel>
    );
  }

  const links = repositoryLinks(repo, mainBranch);

  return (
    <Panel>
      <PanelHeader
        title="Repositório"
        icon={Github}
        hint={repo.slug}
        action={
          <a
            href={repo.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-caption text-accent hover:underline"
          >
            Abrir <ExternalLink className="size-3.5" />
          </a>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-md border border-line px-2.5 py-1 text-caption text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            {link.label}
          </a>
        ))}
      </div>

      {atividade === null ? (
        <p className="mt-4 text-caption text-ink-subtle">Carregando atividade…</p>
      ) : !atividade.available ? (
        <p className="mt-4 text-caption text-ink-subtle">
          {MOTIVO[atividade.reason] ?? MOTIVO.falhou}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="flex flex-wrap items-center gap-1.5">
            <Badge tone={atividade.isPrivate ? "neutral" : "info"}>
              {atividade.isPrivate ? "privado" : "público"}
            </Badge>
            <Badge>{atividade.defaultBranch}</Badge>
            {atividade.pullRequests.length ? (
              <Badge tone="caution">
                {atividade.pullRequests.length} PR{atividade.pullRequests.length > 1 ? "s" : ""} aberto
                {atividade.pullRequests.length > 1 ? "s" : ""}
              </Badge>
            ) : null}
          </p>

          {atividade.commits.length ? (
            <section>
              <h3 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-ink-muted">
                Últimos commits
              </h3>
              <ul className="space-y-1.5">
                {atividade.commits.map((commit) => (
                  <li key={commit.sha} className="flex items-baseline gap-2">
                    <a
                      href={commit.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="tabular shrink-0 text-caption text-accent hover:underline"
                    >
                      {commit.sha}
                    </a>
                    <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                      {commit.message}
                    </span>
                    <span className="shrink-0 text-caption text-ink-subtle">{idade(commit.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {atividade.pullRequests.length ? (
            <section>
              <h3 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-ink-muted">
                Pull requests abertos
              </h3>
              <ul className="space-y-1.5">
                {atividade.pullRequests.map((pull) => (
                  <li key={pull.number} className="flex items-baseline gap-2">
                    <a
                      href={pull.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="tabular shrink-0 text-caption text-accent hover:underline"
                    >
                      #{pull.number}
                    </a>
                    <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{pull.title}</span>
                    {pull.isDraft ? <Badge tone="neutral">rascunho</Badge> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {atividade.issues.length ? (
            <section>
              <h3 className="mb-1.5 text-caption font-semibold uppercase tracking-wide text-ink-muted">
                Issues abertas
              </h3>
              <ul className="space-y-1.5">
                {atividade.issues.map((issue) => (
                  <li key={issue.number} className="flex items-baseline gap-2">
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="tabular shrink-0 text-caption text-accent hover:underline"
                    >
                      #{issue.number}
                    </a>
                    <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{issue.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!atividade.commits.length && !atividade.pullRequests.length && !atividade.issues.length ? (
            <p className="text-caption text-ink-subtle">
              Nenhuma atividade recente no ramo {atividade.defaultBranch}.
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
