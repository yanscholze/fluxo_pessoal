"use client";

/**
 * Navegação entre os relatórios, preservando o recorte.
 *
 * Trocar de relatório **não** volta o período para o padrão. Quem está olhando
 * doze meses de despesa e vai ver a renda quer os mesmos doze meses — perder o
 * recorte a cada troca obriga a reconfigurar em toda navegação, e o usuário
 * desiste de comparar.
 */

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { join } from "../../ui/primitives.tsx";

const RELATORIOS = [
  { href: "/relatorios", label: "Resumo" },
  { href: "/relatorios/despesas", label: "Despesas" },
  { href: "/relatorios/renda", label: "Renda" },
  { href: "/relatorios/assinaturas", label: "Assinaturas" },
] as const;

export function ReportNav() {
  const pathname = usePathname();
  const params = useSearchParams();
  const periodo = params.get("periodo");

  return (
    <nav aria-label="Relatórios" className="flex gap-1 overflow-x-auto border-b border-line">
      {RELATORIOS.map((relatorio) => {
        const ativo = pathname === relatorio.href;
        const href = periodo ? `${relatorio.href}?periodo=${periodo}` : relatorio.href;

        return (
          <Link
            key={relatorio.href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            className={join(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-body-sm transition-colors",
              ativo
                ? "border-accent font-medium text-ink"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {relatorio.label}
          </Link>
        );
      })}
    </nav>
  );
}
