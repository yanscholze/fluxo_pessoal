import { redirect } from "next/navigation";

import { currentUser } from "../auth-context.ts";
import { Shell } from "../ui/shell.tsx";

/**
 * Layout das telas autenticadas.
 *
 * A verificação de sessão fica aqui, uma vez, e não repetida em cada página —
 * é o que garante que uma tela nova nasça protegida em vez de depender de
 * alguém lembrar de checar.
 */
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  return <Shell userName={user.displayName}>{children}</Shell>;
}
