/**
 * Leitura do GitHub.
 *
 * O token **não** fica no banco. Ele é segredo do ambiente
 * (`wrangler secret put GITHUB_TOKEN`), pelo mesmo motivo da senha do painel do
 * cliente: um vazamento do Fluxo não pode virar acesso de escrita ao código de
 * todos os projetos. Sem o segredo, a tela continua funcionando — mostra os
 * atalhos e diz que a atividade não está ligada.
 *
 * Só leitura. Nada aqui abre issue, comenta ou faz merge: o Fluxo acompanha o
 * trabalho, não o executa.
 */

import { env } from "cloudflare:workers";

import { parseGithubRepository, type Repository } from "../../core/domain/work/repository.ts";

const API = "https://api.github.com";
const TIMEOUT_MS = 8_000;
/** Quanto de cada lista cabe num painel sem virar rolagem infinita. */
const LIMITE = 5;

export function isConfigured(): boolean {
  return typeof env.GITHUB_TOKEN === "string" && env.GITHUB_TOKEN.length > 0;
}

export type Commit = {
  readonly sha: string;
  readonly message: string;
  readonly author: string | null;
  readonly at: string;
  readonly url: string;
};

export type PullRequest = {
  readonly number: number;
  readonly title: string;
  readonly author: string | null;
  readonly isDraft: boolean;
  readonly url: string;
};

export type Issue = {
  readonly number: number;
  readonly title: string;
  readonly url: string;
};

export type RepositoryActivity =
  | { readonly available: false; readonly reason: "sem-repositorio" | "sem-token" | "sem-acesso" | "falhou" }
  | {
      readonly available: true;
      readonly repository: Repository;
      readonly defaultBranch: string;
      readonly isPrivate: boolean;
      readonly openIssues: number;
      readonly commits: readonly Commit[];
      readonly pullRequests: readonly PullRequest[];
      readonly issues: readonly Issue[];
    };

async function pedir<T>(caminho: string): Promise<T | null> {
  const controlador = new AbortController();
  const relogio = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(`${API}${caminho}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "user-agent": "fluxo-pessoal",
        "x-github-api-version": "2022-11-28",
      },
      signal: controlador.signal,
    });

    if (!resposta.ok) return null;
    return (await resposta.json()) as T;
  } catch {
    // Rede fora, tempo esgotado, resposta ilegível: a tela do projeto não pode
    // deixar de abrir porque o GitHub está indisponível.
    return null;
  } finally {
    clearTimeout(relogio);
  }
}

type RepoResposta = { default_branch?: string; private?: boolean; open_issues_count?: number };
type CommitResposta = {
  sha: string;
  html_url: string;
  commit?: { message?: string; author?: { name?: string; date?: string } };
  author?: { login?: string };
};
type PullResposta = { number: number; title: string; draft?: boolean; html_url: string; user?: { login?: string } };
type IssueResposta = { number: number; title: string; html_url: string; pull_request?: unknown };

/**
 * O que está acontecendo no repositório do projeto.
 *
 * Uma chamada por lista, em paralelo. Se alguma falhar, as outras continuam:
 * saber que há três PRs abertos é útil mesmo quando os commits não vieram.
 */
export async function repositoryActivity(
  repositoryUrl: string | null,
  branch: string | null,
): Promise<RepositoryActivity> {
  const repo = parseGithubRepository(repositoryUrl);
  if (!repo) return { available: false, reason: "sem-repositorio" };
  if (!isConfigured()) return { available: false, reason: "sem-token" };

  const dados = await pedir<RepoResposta>(`/repos/${repo.slug}`);
  // Repositório privado sem permissão devolve 404, igual a inexistente — do
  // ponto de vista de quem olha a tela, é a mesma situação: não dá para ver.
  if (!dados) return { available: false, reason: "sem-acesso" };

  const ramo = branch?.trim() || dados.default_branch || "main";

  const [commits, pulls, issues] = await Promise.all([
    pedir<CommitResposta[]>(`/repos/${repo.slug}/commits?sha=${encodeURIComponent(ramo)}&per_page=${LIMITE}`),
    pedir<PullResposta[]>(`/repos/${repo.slug}/pulls?state=open&per_page=${LIMITE}`),
    pedir<IssueResposta[]>(`/repos/${repo.slug}/issues?state=open&per_page=${LIMITE}`),
  ]);

  return {
    available: true,
    repository: repo,
    defaultBranch: ramo,
    isPrivate: dados.private === true,
    openIssues: dados.open_issues_count ?? 0,
    commits: (commits ?? []).map((commit) => ({
      sha: commit.sha.slice(0, 7),
      // Só a primeira linha: o corpo do commit é para o `git log`, não para um card.
      message: (commit.commit?.message ?? "").split("\n")[0],
      author: commit.author?.login ?? commit.commit?.author?.name ?? null,
      at: commit.commit?.author?.date ?? "",
      url: commit.html_url,
    })),
    pullRequests: (pulls ?? []).map((pull) => ({
      number: pull.number,
      title: pull.title,
      author: pull.user?.login ?? null,
      isDraft: pull.draft === true,
      url: pull.html_url,
    })),
    // A API de issues devolve pull requests junto; sem este filtro, todo PR
    // apareceria duas vezes na tela, em duas listas diferentes.
    issues: (issues ?? [])
      .filter((issue) => issue.pull_request === undefined)
      .map((issue) => ({ number: issue.number, title: issue.title, url: issue.html_url })),
  };
}
