/**
 * Sessão nos componentes de servidor.
 *
 * Ponte fina entre o `next/headers` e a resolução de sessão do `server/`. Fica
 * em `app/` de propósito: `server/` não conhece Next, para que o mesmo código
 * de autenticação sirva às rotas, ao Android e a um script.
 */

import { cookies } from "next/headers";
import { cache } from "react";

import { SESSION_COOKIE, type AuthenticatedUser, resolveSession } from "../server/auth/session.ts";
import { ensureMigrated } from "../server/db/migrator.ts";

// Layout e página pedem a mesma sessão durante a renderização. `cache` é
// limitado à requisição React, portanto não mistura contas nem repete a
// consulta de autenticação no D1 para cada componente.
export const currentUser = cache(async (): Promise<AuthenticatedUser | null> => {
  await ensureMigrated();
  const store = await cookies();
  return resolveSession(store.get(SESSION_COOKIE)?.value ?? null);
});

export type { AuthenticatedUser };
