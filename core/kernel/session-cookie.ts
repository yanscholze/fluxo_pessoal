/**
 * Nome do cookie de sessão da web.
 *
 * Mora sozinho, sem nenhuma dependência, porque é lido em dois lugares muito
 * diferentes: o serviço de autenticação, que fala com o banco, e o porteiro em
 * `proxy.ts`, que roda antes de qualquer renderização e a cada requisição.
 * Importar o serviço inteiro só para saber o nome de um cookie arrastaria o
 * Drizzle e o cliente do D1 para o caminho mais quente da aplicação.
 */

export const SESSION_COOKIE = "fluxo_session";
