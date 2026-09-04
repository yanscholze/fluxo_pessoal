import { currentUser } from "../auth-context.ts";
import { Shell } from "../ui/shell.tsx";
import { SessionEnded } from "./session-ended.tsx";

/**
 * Layout das telas autenticadas.
 *
 * A verificação de sessão fica aqui, uma vez, e não repetida em cada página —
 * é o que garante que uma tela nova nasça protegida em vez de depender de
 * alguém lembrar de checar.
 *
 * Sem sessão **não redireciona**: renderiza um aviso. O desvio de quem chega
 * sem cookie já aconteceu antes, como resposta HTTP, em `proxy.ts`. Lançar
 * `NEXT_REDIRECT` aqui seria uma segunda tentativa de fazer o mesmo, com o
 * agravante de virar exceção no meio da renderização — que o Vite transmite
 * como erro para todas as abas abertas. Ver `session-ended.tsx`.
 */
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) return <SessionEnded />;

  return <Shell userName={user.displayName}>{children}</Shell>;
}
