/**
 * Porteiro das telas autenticadas.
 *
 * Quem chega sem cookie de sessão é mandado para `/entrar` **antes** de a
 * página começar a renderizar. Não é otimização: é o que impede o
 * redirecionamento de virar exceção no meio da árvore de componentes.
 *
 * O `redirect()` de um Server Component funciona lançando `NEXT_REDIRECT`. O
 * servidor converte isso na resposta 307 correta, mas a exceção também sobe
 * pela camada de SSR, que a registra como "Internal server error" — e em
 * desenvolvimento o Vite transmite esse erro para **todas** as abas abertas,
 * pintando a tarja vermelha por cima de um aplicativo que está funcionando.
 * Uma visita anônima qualquer, num navegador esquecido ou num robô, sujava a
 * tela de quem estava logado. Aqui o desvio é uma resposta HTTP desde o
 * começo, e não existe exceção para vazar.
 *
 * **Isto não é a autorização.** A verificação de verdade — token válido, não
 * expirado, não revogado — continua no layout do painel, que consulta o banco.
 * Aqui só se olha se o cookie existe, porque o porteiro roda antes de tudo e
 * em toda requisição: colocar uma consulta ao banco neste caminho cobraria
 * de todo mundo o preço de barrar ninguém. Cookie presente mas inválido passa
 * por aqui e é barrado adiante, como deve ser.
 */

import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "./core/kernel/session-cookie.ts";

export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const destino = new URL("/entrar", request.url);
  return NextResponse.redirect(destino);
}

/**
 * Só as telas do painel passam por aqui.
 *
 * Ficam de fora `/entrar` (seria um laço), `/api` (responde 401 em JSON, e um
 * cliente que recebe HTML de login no lugar de erro não tem como se recuperar)
 * e tudo que é arquivo servido.
 */
export const config = {
  matcher: ["/((?!entrar|api|_next|favicon|manifest|icons|.*\\.[a-z0-9]+$).*)"],
};
