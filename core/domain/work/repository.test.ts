import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseGithubRepository, repositoryLinks } from "./repository.ts";

describe("endereço do repositório", () => {
  it("entende as quatro formas de escrever o mesmo repositório", () => {
    const esperado = { owner: "yanscholze", name: "fluxo_pessoal", slug: "yanscholze/fluxo_pessoal" };

    for (const escrito of [
      "https://github.com/yanscholze/fluxo_pessoal",
      "https://github.com/yanscholze/fluxo_pessoal.git",
      "https://github.com/yanscholze/fluxo_pessoal/",
      "git@github.com:yanscholze/fluxo_pessoal.git",
    ]) {
      const lido = parseGithubRepository(escrito);
      assert.equal(lido?.owner, esperado.owner, escrito);
      assert.equal(lido?.name, esperado.name, escrito);
      assert.equal(lido?.slug, esperado.slug, escrito);
      assert.equal(lido?.url, "https://github.com/yanscholze/fluxo_pessoal", escrito);
    }
  });

  it("recusa o que não é GitHub, em vez de montar link quebrado", () => {
    for (const outro of [
      "https://gitlab.com/dono/repo",
      "https://bitbucket.org/dono/repo",
      "https://github.com/dono",
      "não é url",
      "",
      null,
      undefined,
    ]) {
      assert.equal(parseGithubRepository(outro), null, String(outro));
    }
  });

  it("os atalhos apontam para o ramo do projeto, não para um chute", () => {
    const repo = parseGithubRepository("https://github.com/dono/repo");
    assert.ok(repo);

    const comRamo = repositoryLinks(repo, "producao");
    assert.ok(comRamo.some((link) => link.href.endsWith("/commits/producao")));

    // Sem ramo cadastrado, `main` é o padrão do próprio GitHub.
    const semRamo = repositoryLinks(repo, null);
    assert.ok(semRamo.some((link) => link.href.endsWith("/commits/main")));
  });
});
