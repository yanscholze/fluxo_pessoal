/**
 * Sessão nos componentes de servidor.
 *
 * Ponte fina entre o `next/headers` e a resolução de sessão do `server/`. Fica
 * em `app/` de propósito: `server/` não conhece Next, para que o mesmo código
 * de autenticação sirva às rotas, ao Android e a um script.
 */

import { cookies } from "next/headers";

import { SESSION_COOKIE, type AuthenticatedUser, resolveSession } from "../server/auth/session.ts";
import { ensureMigrated } from "../server/db/migrator.ts";

export async function currentUser(): Promise<AuthenticatedUser | null> {
  await ensureMigrated();
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value ?? null);
}

export type { AuthenticatedUser };
