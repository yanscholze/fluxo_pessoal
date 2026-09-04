/**
 * Substituto de `cloudflare:workers` para os testes.
 *
 * O `server/db/client.ts` lê o binding do D1 daquele módulo, que só existe
 * dentro do runtime do Worker. O carregador em `loader.mjs` aponta o
 * especificador para cá quando o teste roda no Node.
 *
 * A alternativa seria tornar o acesso ao binding injetável no código de
 * produção — trocar o desenho da aplicação para acomodar o teste. Um mapa de
 * módulo no carregador resolve o mesmo problema sem que a produção saiba que
 * existe teste.
 */

/**
 * Preenchido por `instalarBinding` antes de qualquer serviço ser importado.
 *
 * Os segredos ficam aqui pelo mesmo motivo do binding: em produção eles vêm do
 * ambiente do Worker, e o teste precisa conseguir dizer "existe token" ou "não
 * existe token" sem que o código de produção ganhe um jeito de ser configurado
 * por fora.
 */
export const env: { DB: unknown; GITHUB_TOKEN?: string; OPENAI_API_KEY?: string } = { DB: null };

export function instalarBinding(binding: unknown): void {
  env.DB = binding;
}

/** Define ou remove um segredo do ambiente simulado. */
export function definirSegredo(nome: "GITHUB_TOKEN" | "OPENAI_API_KEY", valor: string | undefined): void {
  if (valor === undefined) delete env[nome];
  else env[nome] = valor;
}
