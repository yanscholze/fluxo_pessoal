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

/** Preenchido por `instalarBanco` antes de qualquer serviço ser importado. */
export const env: { DB: unknown } = { DB: null };

export function instalarBinding(binding: unknown): void {
  env.DB = binding;
}
