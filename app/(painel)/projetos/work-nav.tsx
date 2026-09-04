"use client";

/**
 * Navegação da área de trabalho.
 *
 * Projetos, quadro, agenda e horas respondem perguntas diferentes sobre o mesmo
 * trabalho — quanto vale, o que está travado, o que vence quando, quanto custou
 * de tempo — e por isso ficam lado a lado em vez de virarem quatro itens soltos
 * no menu lateral.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { join } from "../../ui/primitives.tsx";

const ABAS = [
  { href: "/projetos", label: "Projetos" },
  { href: "/projetos/quadro", label: "Quadro" },
  { href: "/projetos/agenda", label: "Agenda" },
  { href: "/projetos/horas", label: "Horas" },
] as const;

export function WorkNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Área de trabalho" className="flex gap-1 overflow-x-auto border-b border-line">
      {ABAS.map((aba) => {
        const ativo = pathname === aba.href;

        return (
          <Link
            key={aba.href}
            href={aba.href}
            aria-current={ativo ? "page" : undefined}
            className={join(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-body-sm transition-colors",
              ativo
                ? "border-accent font-medium text-ink"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {aba.label}
          </Link>
        );
      })}
    </nav>
  );
}
