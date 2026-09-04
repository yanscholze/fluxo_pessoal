"use client";

/**
 * Casca do aplicativo: navegação, identidade e preferências de exibição.
 *
 * Só o que é interativo mora aqui. Os dados de cada tela vêm de componente de
 * servidor — a casca não busca nada e não sabe nada sobre dinheiro.
 *
 * A navegação é **agrupada**. A versão anterior tinha dezessete itens numa
 * lista plana, e uma lista plana de dezessete não é navegação: é um índice que
 * obriga a ler tudo para achar um. Os grupos respondem "que tipo de coisa eu
 * quero fazer" antes de "qual tela".
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { BackButton } from "./back-button.tsx";
import { BottomNav } from "./bottom-nav.tsx";
import { gravarPreferencia, usePreferencia } from "./browser-preference.ts";

import {
  BarChart3,
  Briefcase,
  Calendar,
  CreditCard,
  Gauge,
  Gift,
  Landmark,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Menu,
  Moon,
  PanelLeft,
  PanelLeftClose,
  Plane,
  Receipt,
  Repeat,
  Settings,
  Smartphone,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Upload,
  Wallet,
  X,
  Zap,
} from "./icons.tsx";
import { join } from "./primitives.tsx";

export type NavItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
};

export type NavGroup = {
  readonly title: string;
  readonly items: readonly NavItem[];
};

export const NAV: readonly NavGroup[] = [
  {
    title: "Visão geral",
    items: [
      { href: "/", label: "Painel", icon: LayoutDashboard },
      { href: "/saude", label: "Saúde financeira", icon: Gauge },
    ],
  },
  {
    title: "Movimentação",
    items: [
      { href: "/lancamentos", label: "Lançamentos", icon: Receipt },
      { href: "/contas", label: "Contas", icon: Landmark },
      { href: "/cartoes", label: "Cartões e faturas", icon: CreditCard },
      { href: "/parcelamentos", label: "Parcelamentos", icon: Repeat },
    ],
  },
  {
    title: "Planejamento",
    items: [
      { href: "/planejamento", label: "Recorrências", icon: Calendar },
      { href: "/assinaturas", label: "Assinaturas", icon: Repeat },
      { href: "/orcamentos", label: "Orçamentos", icon: Wallet },
      { href: "/metas", label: "Metas", icon: Target },
    ],
  },
  {
    title: "Patrimônio",
    items: [
      { href: "/patrimonio", label: "Visão geral", icon: Landmark },
      { href: "/investimentos", label: "Investimentos", icon: TrendingUp },
      { href: "/recompensas", label: "Recompensas", icon: Gift },
      { href: "/viagens", label: "Viagens", icon: Plane },
    ],
  },
  {
    title: "Análise",
    items: [{ href: "/relatorios", label: "Relatórios", icon: BarChart3 }],
  },
  {
    title: "Trabalho",
    items: [{ href: "/projetos", label: "Projetos", icon: Briefcase }],
  },
  {
    title: "Sistema",
    items: [
      { href: "/automaticos", label: "Automações", icon: Zap },
      { href: "/importar", label: "Importações", icon: Upload },
      { href: "/assistente", label: "Assistente", icon: Sparkles },
      { href: "/conectar", label: "Aparelhos", icon: Smartphone },
      { href: "/configuracoes", label: "Configurações", icon: Settings },
    ],
  },
];

const CHAVE_RECOLHIDA = "fluxo:menu-recolhido";

export function Shell({ userName, children }: { userName: string; children: ReactNode }) {
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);
  const [rotaDaGaveta, setRotaDaGaveta] = useState(pathname);

  // Navegar fecha a gaveta: no celular ela cobre a tela inteira, e ficar
  // aberta depois do clique esconde justamente a página que o usuário pediu.
  // Ajuste durante a renderização, não em efeito: fechar num efeito pinta a
  // gaveta aberta sobre a página nova por um quadro antes de sumir.
  if (rotaDaGaveta !== pathname) {
    setRotaDaGaveta(pathname);
    setMenuAberto(false);
  }

  const recolhida = usePreferencia(() => localStorage.getItem(CHAVE_RECOLHIDA) === "1", false);

  function alternarLargura() {
    gravarPreferencia(() => {}, CHAVE_RECOLHIDA, recolhida ? "0" : "1");
  }

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* Véu da gaveta no celular. */}
      {menuAberto ? (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMenuAberto(false)}
          className="fixed inset-0 z-30 bg-canvas/70 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <nav
        id="navegacao"
        aria-label="Navegação principal"
        className={join(
          "fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-line bg-surface",
          "transition-[transform,width] duration-200 ease-out-soft",
          "lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
          menuAberto ? "translate-x-0" : "-translate-x-full",
          recolhida ? "w-[15rem] lg:w-[4.25rem]" : "w-[15rem]",
        )}
      >
        <div className={join("flex h-14 shrink-0 items-center gap-2", recolhida ? "lg:justify-center lg:px-0 px-4" : "px-4")}>
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 text-title text-ink"
            aria-label="Fluxo — página inicial"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-ink">
              <svg viewBox="0 0 16 16" className="size-4" aria-hidden fill="none">
                <path
                  d="M3 11.5c2.2 0 2.6-7 5-7s2.8 7 5 7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className={join("truncate", recolhida ? "lg:hidden" : "")}>Fluxo</span>
          </Link>

          <button
            type="button"
            onClick={() => setMenuAberto(false)}
            aria-label="Fechar menu"
            className="ml-auto rounded-md p-1.5 text-ink-muted hover:bg-surface-inset lg:hidden"
          >
            <X size={17} strokeWidth={1.5} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
          {NAV.map((grupo) => (
            <div key={grupo.title} className="mb-4 last:mb-0">
              <p
                className={join(
                  "px-2 pb-1.5 pt-2 text-label uppercase text-ink-subtle",
                  recolhida ? "lg:sr-only" : "",
                )}
              >
                {grupo.title}
              </p>
              <ul className="space-y-0.5">
                {grupo.items.map((item) => (
                  <li key={item.href}>
                    <ItemDeNavegacao item={item} pathname={pathname} recolhida={recolhida} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="shrink-0 border-t border-line p-2.5">
          <Link
            href="/configuracoes"
            className={join(
              "flex items-center gap-2.5 rounded-md p-1.5 transition-colors hover:bg-surface-inset",
              recolhida ? "lg:justify-center" : "",
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-wash text-label uppercase text-accent">
              {iniciais(userName)}
            </span>
            <span className={join("min-w-0 flex-1", recolhida ? "lg:hidden" : "")}>
              <span className="block truncate text-body-sm text-ink">{userName}</span>
              <span className="block text-caption text-ink-subtle">Ver conta</span>
            </span>
          </Link>

          <div className={join("mt-1.5 flex gap-1", recolhida ? "lg:flex-col" : "")}>
            <BotaoDeTema recolhida={recolhida} />
            <BotaoDeSaida recolhida={recolhida} />
            <button
              type="button"
              onClick={alternarLargura}
              aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
              title={recolhida ? "Expandir menu" : "Recolher menu"}
              className="hidden size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-inset hover:text-ink lg:inline-flex"
            >
              {recolhida ? (
                <PanelLeft size={16} strokeWidth={1.5} aria-hidden />
              ) : (
                <PanelLeftClose size={16} strokeWidth={1.5} aria-hidden />
              )}
            </button>
          </div>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior: existe para o celular ter como abrir a gaveta e para
            a marca ter lugar quando a barra lateral está fora da tela. */}
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-md sm:px-6 lg:hidden">
          <button
            type="button"
            onClick={() => setMenuAberto(true)}
            aria-expanded={menuAberto}
            aria-controls="navegacao"
            aria-label="Abrir menu"
            className="rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-inset hover:text-ink"
          >
            <Menu size={19} strokeWidth={1.5} aria-hidden />
          </button>

          {/* Voltar some quando não há para onde: no celular a barra tem três
              elementos e um botão inerte ocuparia o espaço do único que
              importa. */}
          <BackButton fallback="/" label="Voltar" hideWhenEmpty compact />

          <Link href="/" className="text-title text-ink">
            Fluxo
          </Link>
        </header>

        {/* O respiro embaixo é do tamanho da barra inferior: sem ele o último
            cartão da página fica escondido atrás dela no celular. */}
        <div className="min-w-0 flex-1 pb-20 lg:pb-0">{children}</div>
      </div>

      <BottomNav />
    </div>
  );
}

function ItemDeNavegacao({
  item,
  pathname,
  recolhida,
}: {
  item: NavItem;
  pathname: string;
  recolhida: boolean;
}) {
  const ativo = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
  const Icone = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      title={recolhida ? item.label : undefined}
      className={join(
        "relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-body-sm transition-colors",
        recolhida ? "lg:justify-center lg:px-0" : "",
        ativo
          ? "bg-accent-wash font-medium text-accent"
          : "text-ink-muted hover:bg-surface-inset hover:text-ink",
      )}
    >
      {/* Marca o item ativo mesmo quando a barra está recolhida e o rótulo some. */}
      {ativo ? (
        <span className="absolute -left-2.5 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-accent" aria-hidden />
      ) : null}
      <Icone size={16} strokeWidth={1.5} className="shrink-0" aria-hidden />
      <span className={join("truncate", recolhida ? "lg:hidden" : "")}>{item.label}</span>
    </Link>
  );
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function BotaoDeTema({ recolhida }: { recolhida: boolean }) {
  // `null` no servidor: lá não há `<html>` com tema para consultar, e chutar
  // "claro" faria o botão trocar de rótulo sozinho na hidratação.
  const escuro = usePreferencia<boolean | "">(
    (raiz) => raiz.dataset.theme === "dark",
    "",
  );

  function alternar() {
    const proximo = !escuro;
    gravarPreferencia(
      (raiz) => {
        raiz.dataset.theme = proximo ? "dark" : "light";
      },
      "fluxo:tema",
      proximo ? "escuro" : "claro",
    );
  }

  const rotulo = escuro === "" ? "Alternar tema" : escuro ? "Usar tema claro" : "Usar tema escuro";

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={rotulo}
      title={rotulo}
      className={join(
        "inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-inset hover:text-ink",
        recolhida ? "" : "flex-1",
      )}
    >
      {escuro === false ? <Moon size={16} strokeWidth={1.5} aria-hidden /> : <Sun size={16} strokeWidth={1.5} aria-hidden />}
    </button>
  );
}

function BotaoDeSaida({ recolhida }: { recolhida: boolean }) {
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
      aria-label="Sair"
      title="Sair"
      className={join(
        "inline-flex size-8 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-negative-wash hover:text-negative",
        recolhida ? "" : "flex-1",
      )}
    >
      <LogOut size={16} strokeWidth={1.5} aria-hidden />
    </button>
  );
}
