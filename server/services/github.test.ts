/**
 * Leitura do GitHub.
 *
 * O que precisa ficar preso aqui é o comportamento em falha, que é o caso
 * comum: repositório privado sem acesso, GitHub fora do ar, token ausente. A
 * tela do projeto tem de abrir em todos eles — e o painel precisa dizer qual é
 * a situação, porque "sem token" e "sem acesso" pedem ações diferentes de quem
 * lê.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { definirSegredo } from "../testing/worker-env.ts";

const fetchOriginal = globalThis.fetch;

/** Responde cada caminho da API com o corpo combinado. 404 no que não estiver. */
function responderCom(rotas: Record<string, unknown>): void {
  globalThis.fetch = (async (entrada: RequestInfo | URL) => {
    const url = new URL(String(entrada));
    const chave = Object.keys(rotas).find((caminho) => url.pathname + url.search === caminho);
    if (chave === undefined) return new Response("null", { status: 404 });
    return new Response(JSON.stringify(rotas[chave]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

describe("atividade do repositório", () => {
  beforeEach(() => {
    definirSegredo("GITHUB_TOKEN", "token-de-teste");
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    definirSegredo("GITHUB_TOKEN", undefined);
  });

  it("sem endereço de repositório, não tenta a rede", async () => {
    const { repositoryActivity } = await import("./github.ts");
    let chamou = false;
    globalThis.fetch = (async () => {
      chamou = true;
      return new Response("null", { status: 200 });
    }) as typeof fetch;

    const resultado = await repositoryActivity(null, null);

    assert.equal(resultado.available, false);
    assert.equal(resultado.available === false && resultado.reason, "sem-repositorio");
    assert.equal(chamou, false, "sem repositório não há o que consultar");
  });

  it("sem token no ambiente, diz que falta ligar — não que falhou", async () => {
    const { repositoryActivity } = await import("./github.ts");
    definirSegredo("GITHUB_TOKEN", undefined);

    const resultado = await repositoryActivity("https://github.com/dono/repo", null);

    assert.equal(resultado.available === false && resultado.reason, "sem-token");
  });

  it("repositório inacessível não derruba a chamada", async () => {
    const { repositoryActivity } = await import("./github.ts");
    responderCom({});

    const resultado = await repositoryActivity("https://github.com/dono/privado", null);

    assert.equal(resultado.available === false && resultado.reason, "sem-acesso");
  });

  it("rede fora vira resultado indisponível, e não exceção", async () => {
    const { repositoryActivity } = await import("./github.ts");
    globalThis.fetch = (async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as typeof fetch;

    const resultado = await repositoryActivity("https://github.com/dono/repo", null);

    assert.equal(resultado.available === false && resultado.reason, "sem-acesso");
  });

  it("separa pull request de issue e corta o commit na primeira linha", async () => {
    const { repositoryActivity } = await import("./github.ts");

    responderCom({
      "/repos/dono/repo": { default_branch: "main", private: true, open_issues_count: 4 },
      "/repos/dono/repo/commits?sha=main&per_page=5": [
        {
          sha: "abcdef1234567890",
          html_url: "https://github.com/dono/repo/commit/abcdef1",
          commit: {
            message: "Corrige o cálculo da fatura\n\nO corpo explica o porquê e não cabe num card.",
            author: { name: "Fulano", date: "2026-09-01T12:00:00Z" },
          },
          author: { login: "fulano" },
        },
      ],
      "/repos/dono/repo/pulls?state=open&per_page=5": [
        { number: 12, title: "Nova tela de relatórios", draft: false, html_url: "u", user: { login: "fulano" } },
      ],
      "/repos/dono/repo/issues?state=open&per_page=5": [
        { number: 12, title: "Nova tela de relatórios", html_url: "u", pull_request: { url: "u" } },
        { number: 9, title: "Erro ao salvar assinatura", html_url: "u2" },
      ],
    });

    const resultado = await repositoryActivity("https://github.com/dono/repo.git", null);

    assert.equal(resultado.available, true);
    if (!resultado.available) return;

    assert.equal(resultado.isPrivate, true);
    assert.equal(resultado.defaultBranch, "main");
    assert.equal(resultado.commits[0].sha, "abcdef1", "o sha curto é o que se lê");
    assert.equal(resultado.commits[0].message, "Corrige o cálculo da fatura");
    assert.equal(resultado.commits[0].author, "fulano");
    assert.equal(resultado.pullRequests.length, 1);
    assert.deepEqual(
      resultado.issues.map((issue) => issue.number),
      [9],
      "o PR não pode aparecer também como issue",
    );
  });

  it("o ramo cadastrado no projeto vence o padrão do repositório", async () => {
    const { repositoryActivity } = await import("./github.ts");

    responderCom({
      "/repos/dono/repo": { default_branch: "main" },
      "/repos/dono/repo/commits?sha=producao&per_page=5": [],
      "/repos/dono/repo/pulls?state=open&per_page=5": [],
      "/repos/dono/repo/issues?state=open&per_page=5": [],
    });

    const resultado = await repositoryActivity("https://github.com/dono/repo", "producao");

    assert.equal(resultado.available === true && resultado.defaultBranch, "producao");
  });
});

describe("lista de repositórios", () => {
  beforeEach(() => {
    definirSegredo("GITHUB_TOKEN", "token-de-teste");
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    definirSegredo("GITHUB_TOKEN", undefined);
  });

  it("sem token não consulta e devolve null", async () => {
    const { listRepositories } = await import("./github.ts");
    definirSegredo("GITHUB_TOKEN", undefined);

    let chamou = false;
    globalThis.fetch = (async () => {
      chamou = true;
      return new Response("[]", { status: 200 });
    }) as typeof fetch;

    assert.equal(await listRepositories(), null);
    assert.equal(chamou, false);
  });

  it("junta as páginas e descarta o que não tem nome nem endereço", async () => {
    const { listRepositories } = await import("./github.ts");

    responderCom({
      "/user/repos?per_page=100&page=1&sort=pushed&affiliation=owner,collaborator,organization_member": [
        {
          full_name: "dono/alpha",
          html_url: "https://github.com/dono/alpha",
          default_branch: "main",
          private: true,
          description: "O primeiro",
          pushed_at: "2026-09-01T10:00:00Z",
        },
        // Sem `full_name`: não dá para montar o slug, então não entra.
        { html_url: "https://github.com/dono/sem-nome" },
      ],
      "/user/repos?per_page=100&page=2&sort=pushed&affiliation=owner,collaborator,organization_member": [
        { full_name: "dono/beta", html_url: "https://github.com/dono/beta" },
      ],
    });

    const lista = await listRepositories();

    assert.deepEqual(
      lista?.map((repo) => repo.slug),
      ["dono/alpha", "dono/beta"],
    );
    assert.equal(lista?.[0].isPrivate, true);
    assert.equal(lista?.[1].defaultBranch, "main", "sem ramo declarado, o padrão do GitHub");
  });

  it("a segunda página vazia é normal; a primeira falhar não é", async () => {
    const { listRepositories } = await import("./github.ts");

    // Só a página 1 responde: quem tem menos de cem repositórios cai aqui.
    responderCom({
      "/user/repos?per_page=100&page=1&sort=pushed&affiliation=owner,collaborator,organization_member": [
        { full_name: "dono/unico", html_url: "https://github.com/dono/unico" },
      ],
    });
    assert.equal((await listRepositories())?.length, 1);

    // Nenhuma responde: token recusado, e a tela precisa saber disso.
    responderCom({});
    assert.equal(await listRepositories(), null);
  });
});
