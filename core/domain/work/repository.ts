/**
 * O endereço do repositório, entendido.
 *
 * A URL que o usuário cola varia — `https://github.com/dono/repo`, com `.git`
 * no fim, com barra sobrando, ou o endereço SSH copiado do próprio GitHub. Os
 * quatro apontam para o mesmo lugar, e a tela precisa tratá-los como o mesmo
 * lugar para conseguir montar os atalhos.
 *
 * Fica no domínio porque é regra de leitura, não de rede: nada aqui faz
 * requisição, e por isso pode ser testado sem servidor nenhum.
 */

export type Repository = {
  readonly owner: string;
  readonly name: string;
  /** `dono/repo`, que é como a API do GitHub identifica o repositório. */
  readonly slug: string;
  readonly url: string;
};

const GITHUB_HTTP = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;
const GITHUB_SSH = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i;

/**
 * Lê `dono/repo` de um endereço do GitHub.
 *
 * Devolve `null` para qualquer outra coisa — inclusive GitLab e Bitbucket, que
 * são repositórios válidos mas cujos caminhos de issues e pull requests são
 * diferentes. Fingir que entende produziria links quebrados, que é pior do que
 * não oferecer link nenhum.
 */
export function parseGithubRepository(value: string | null | undefined): Repository | null {
  if (!value) return null;
  const bruto = value.trim();
  if (!bruto) return null;

  const encontrado = GITHUB_HTTP.exec(bruto) ?? GITHUB_SSH.exec(bruto);
  if (!encontrado) return null;

  const [, owner, name] = encontrado;
  // `owner` e `name` não podem ser segmentos de navegação do próprio GitHub.
  if (owner === "." || owner === ".." || name === "." || name === "..") return null;

  return {
    owner,
    name,
    slug: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
  };
}

export type RepositoryLink = { readonly label: string; readonly href: string };

/**
 * Os lugares para onde se vai a partir de um projeto.
 *
 * A ordem é a do dia de trabalho: o que está aberto para resolver, o que está
 * esperando revisão, o que aconteceu, o que quebrou no deploy.
 */
export function repositoryLinks(repo: Repository, branch?: string | null): RepositoryLink[] {
  const ramo = branch?.trim() || "main";

  return [
    { label: "Issues abertas", href: `${repo.url}/issues` },
    { label: "Pull requests", href: `${repo.url}/pulls` },
    { label: "Commits", href: `${repo.url}/commits/${encodeURIComponent(ramo)}` },
    { label: "Actions", href: `${repo.url}/actions` },
    { label: "Releases", href: `${repo.url}/releases` },
  ];
}
