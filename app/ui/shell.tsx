"use client";

/**
 * Casca do aplicativo: navegação, identidade e preferências de exibição.
 *
 * Só o que é interativo mora aqui. Os dados de cada tela vêm de componente de
 * servidor — a casca não busca nada e não sabe nada sobre dinheiro.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export type NavItem = {
  readonly href: string;
  readonly label: string;
};

export const NAV: readonly NavItem[] = [
  { href: "/", label: "Visão geral" },
  { href: "/lancamentos", label: "Lançamentos" },
  { href: "/contas", label: "Contas" },
  { href: "/cartoes", label: "Cartões" },
  { href: "/parcelamentos", label: "Parcelamentos" },
  { href: "/recompensas", label: "Recompensas" },
  { href: "/planejamento", label: "Planejamento" },
  { href: "/orcamentos", label: "Orçamentos" },
  { href: "/metas", label: "Metas" },
  { href: "/investimentos", label: "Investimentos" },
  { href: "/viagens", label: "Viagens" },
  { href: "/saude", label: "Saúde" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/importar", label: "Importar" },
  { href: "/automaticos", label: "Automáticos" },
  { href: "/conectar", label: "Conectar celular" },
  { href: "/assistente", label: "Assistente" },
];

export function Shell({ userName, children }: { userName: string; children: ReactNode }) {
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);

  // Navegar fecha o menu: no celular ele cobre a tela inteira, e ficar aberto
  // depois do clique esconde justamente a página que o usuário pediu.
  useEffect(() => setMenuAberto(false), [pathname]);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <header className="flex items-center justify-between border-b border-line bg-surface px-5 py-3 lg:hidden">
        <Link href="/" className="text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink">
          Fluxo
        </Link>
        <button
          type="button"
          onClick={() => setMenuAberto((aberto) => !aberto)}
          aria-expanded={menuAberto}
          aria-controls="navegacao"
          className="rounded-[--radius-control] border border-line px-3 py-1.5 text-[0.8125rem] text-ink"
        >
          {menuAberto ? "Fechar" : "Menu"}
        </button>
      </header>

      <nav
        id="navegacao"
        className={`${menuAberto ? "block" : "hidden"} border-b border-line bg-surface px-3 py-3 lg:sticky lg:top-0 lg:block lg:h-dvh lg:w-56 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-3 lg:py-5`}
      >
        <Link
          href="/"
          className="mb-6 hidden px-2 text-[1.0625rem] font-semibold tracking-[-0.01em] text-ink lg:block"
        >
          Fluxo
        </Link>

        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const ativo = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={ativo ? "page" : undefined}
                  className={`block rounded-[--radius-control] px-3 py-2 text-[0.875rem] transition-colors ${
                    ativo ? "bg-accent-wash font-medium text-accent" : "text-ink-muted hover:bg-surface-sunken"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 border-t border-line pt-4 lg:absolute lg:bottom-5 lg:w-[12.5rem]">
          <Link
            href="/configuracoes"
            className={`block truncate rounded-[--radius-control] px-3 py-2 text-[0.8125rem] transition-colors ${
              pathname.startsWith("/configuracoes")
                ? "bg-accent-wash font-medium text-accent"
                : "text-ink hover:bg-surface-sunken"
            }`}
          >
            {userName}
          </Link>
          <div className="mt-2 flex gap-1.5 px-1">
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function ThemeToggle() {
  const [escuro, setEscuro] = useState<boolean | null>(null);

  useEffect(() => setEscuro(document.documentElement.dataset.theme === "dark"), []);

  function alternar() {
    const proximo = !escuro;
    setEscuro(proximo);
    document.documentElement.dataset.theme = proximo ? "dark" : "light";
    localStorage.setItem("fluxo:tema", proximo ? "escuro" : "claro");
  }

  return (
    <button
      type="button"
      onClick={alternar}
      className="flex-1 rounded-[--radius-control] border border-line px-2 py-1.5 text-[0.75rem] text-ink-muted hover:bg-surface-sunken"
    >
      {escuro === null ? "Tema" : escuro ? "Tema claro" : "Tema escuro"}
    </button>
  );
}

function SignOutButton() {
  const router = useRouter();

  async function sair() {
    await fetch("/api/v1/session", { method: "DELETE" });
    router.replace("/entrar");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={sair}
      className="flex-1 rounded-[--radius-control] border border-line px-2 py-1.5 text-[0.75rem] text-ink-muted hover:bg-surface-sunken"
    >
      Sair
    </button>
  );
}
