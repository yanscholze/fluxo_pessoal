import Link from "next/link";

import { LinkButton } from "./ui/controls.tsx";
import { ArrowLeft } from "./ui/icons.tsx";

/**
 * Endereço que não existe.
 *
 * Fica fora da casca porque um endereço inválido pode ser alcançado sem
 * sessão. Curta e sem drama: o que importa é o caminho de volta.
 */
export default function NaoEncontrado() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-6 text-center">
      <Link href="/" className="flex items-center gap-2 text-title text-ink">
        <span className="flex size-7 items-center justify-center rounded-md bg-accent text-accent-ink">
          <svg viewBox="0 0 16 16" className="size-4" aria-hidden fill="none">
            <path d="M3 11.5c2.2 0 2.6-7 5-7s2.8 7 5 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        Fluxo
      </Link>

      <div>
        <p className="text-label uppercase text-ink-subtle">Erro 404</p>
        <h1 className="mt-1.5 text-title text-ink">Esta página não existe</h1>
        <p className="mt-1.5 max-w-measure-sm text-body-sm text-ink-muted">
          O endereço pode ter mudado, ou o atalho que você seguiu está desatualizado.
        </p>
      </div>

      <LinkButton href="/" variant="secondary" icon={ArrowLeft}>
        Voltar ao painel
      </LinkButton>
    </main>
  );
}
