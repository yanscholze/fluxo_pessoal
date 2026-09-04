"use client";

/**
 * Barra inferior do celular.
 *
 * No celular a navegação era uma gaveta só, com dezessete itens em seis
 * grupos. Registrar um gasto — a coisa que mais se faz, em pé, na fila do
 * caixa — custava abrir o menu, rolar e escolher. É o sintoma clássico de
 * desktop espremido: a mesma árvore de navegação, num aparelho onde ela não
 * cabe.
 *
 * Aqui ficam **quatro destinos e uma ação**, escolhidos pelo que se faz todo
 * dia, não pelo que existe. O resto da aplicação continua na gaveta, que passa
 * a ser o lugar do que se visita de vez em quando — relatório, configuração,
 * importação.
 *
 * Quatro é o limite prático: com cinco destinos mais a ação central, cada alvo
 * fica abaixo dos 44px que um polegar acerta sem mirar.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CreditCard, LayoutDashboard, Plus, Receipt, Wallet } from "./icons.tsx";
import { join } from "./primitives.tsx";

const DESTINOS = [
  { href: "/", label: "Painel", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Extrato", icon: Receipt },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/orcamentos", label: "Orçamento", icon: Wallet },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal do celular"
      // `pb-safe` acompanha a faixa do gesto de voltar dos aparelhos sem botão
      // físico; sem ela o último item fica embaixo da barra do sistema.
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {DESTINOS.slice(0, 2).map((destino) => (
          <ItemInferior key={destino.href} destino={destino} pathname={pathname} />
        ))}

        <li className="flex items-center px-1">
          {/* A ação primária no meio, elevada: é o único elemento da barra que
              não é navegação, e precisa se distinguir sem legenda. */}
          <Link
            href="/lancamentos?novo=1"
            aria-label="Novo lançamento"
            className="flex size-12 -translate-y-3 items-center justify-center rounded-full bg-accent text-accent-ink shadow-float transition-transform active:scale-95"
          >
            <Plus size={20} strokeWidth={2} aria-hidden />
          </Link>
        </li>

        {DESTINOS.slice(2).map((destino) => (
          <ItemInferior key={destino.href} destino={destino} pathname={pathname} />
        ))}
      </ul>
    </nav>
  );
}

function ItemInferior({
  destino,
  pathname,
}: {
  destino: (typeof DESTINOS)[number];
  pathname: string;
}) {
  const ativo = destino.href === "/" ? pathname === "/" : pathname.startsWith(destino.href);
  const Icone = destino.icon;

  return (
    <li className="flex-1">
      <Link
        href={destino.href}
        aria-current={ativo ? "page" : undefined}
        className={join(
          "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 text-caption transition-colors",
          ativo ? "text-accent" : "text-ink-subtle hover:text-ink-muted",
        )}
      >
        <Icone size={19} strokeWidth={ativo ? 2 : 1.5} aria-hidden />
        <span className="truncate">{destino.label}</span>
      </Link>
    </li>
  );
}
