"use client";

/**
 * A casca do aplicativo, desenhada no Mesa.
 *
 * Barra lateral de vidro à esquerda, coluna de conteúdo à direita, e entre as
 * duas um respiro de 1rem — a lateral **flutua** sobre o fundo em vez de
 * encostar na borda da janela, e é esse respiro que deixa o brilho roxo do
 * `.app-shell` aparecer atrás dela.
 *
 * A navegação é plana: treze itens, sem títulos de grupo, na ordem em que o
 * desenho apresenta o produto. A versão anterior agrupava em quatro seções, o
 * que ajudava a achar mas empurrava o último item para fora da dobra.
 *
 * **O que o desenho não mostra continua existindo, sem virar elemento novo.**
 * As seis telas que o Mesa não desenhou continuam alcançáveis pelo caminho
 * normal, e não por um item extra na lateral: patrimônio, investimentos,
 * metas e saúde são as quatro vistas de Visão geral, aonde o TARS leva pelo
 * painel "Construindo o futuro"; recompensas é uma aba de Cartões;
 * importações, uma aba de Automações. A busca por `Ctrl/⌘ K` ficou por cima
 * disso, invisível, como atalho de quem já sabe o nome do que procura — no
 * celular, onde ela não existe, nenhuma das seis depende dela.
 *
 * Sair da conta também mora em Configurações. É ação rara, e o cartão de
 * usuário do rodapé leva até lá num clique.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { BottomNav } from "./bottom-nav.tsx";
import { Dialog } from "./dialog.tsx";
import { Input } from "./controls.tsx";
import {
  ArrowRight, Bell, Bot, BriefcaseBusiness, CalendarClock, ChartColumn, CreditCard,
  FileChartColumnIncreasing, Gauge, Gift, Import, Landmark, LayoutDashboard,
  type LucideIcon, Menu, Plane, Plus, ReceiptText, Settings, Smartphone, Target,
  TrendingUp, WalletCards, X, Zap,
} from "./icons.tsx";
import { join } from "./primitives.tsx";

export type NavItem = { readonly href: string; readonly label: string; readonly icon: LucideIcon };

/**
 * Os treze itens do desenho, na ordem dele.
 *
 * O TARS abre a lista de propósito: é a tela que responde antes de você
 * perguntar, e o desenho a coloca acima do painel por isso.
 */
export const NAV: readonly NavItem[] = [
  { href: "/", label: "TARS", icon: Bot },
  { href: "/painel", label: "Painel", icon: LayoutDashboard },
  { href: "/lancamentos", label: "Lançamentos", icon: ReceiptText },
  { href: "/contas", label: "Contas", icon: WalletCards },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/planejamento", label: "Compromissos", icon: CalendarClock },
  { href: "/parcelamentos", label: "Parcelamentos", icon: ChartColumn },
  { href: "/assinaturas", label: "Assinaturas", icon: Zap },
  { href: "/orcamentos", label: "Orçamentos", icon: Target },
  { href: "/viagens", label: "Viagens", icon: Plane },
  { href: "/projetos", label: "Projetos", icon: BriefcaseBusiness },
  { href: "/relatorios", label: "Relatórios", icon: FileChartColumnIncreasing },
  { href: "/automaticos", label: "Automações", icon: Import },
];

/**
 * As telas que o desenho não coloca na lateral.
 *
 * Elas existem, têm endereço próprio e precisam de nome na barra de cima —
 * sem isto, quem abre Metas lê "Fluxo" no título e fica sem saber onde está.
 * O que elas não têm é assento na navegação, que o Mesa fecha em treze itens.
 */
const FORA_DA_NAVEGACAO: readonly NavItem[] = [
  { href: "/configuracoes", label: "Configurações", icon: Settings },
  { href: "/patrimonio", label: "Patrimônio", icon: Landmark },
  { href: "/investimentos", label: "Investimentos", icon: TrendingUp },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/recompensas", label: "Recompensas", icon: Gift },
  { href: "/saude", label: "Saúde financeira", icon: Gauge },
  { href: "/importar", label: "Importar extrato", icon: Import },
  { href: "/planejamento", label: "Compromissos", icon: CalendarClock },
  { href: "/conectar", label: "Aparelhos", icon: Smartphone },
];

/**
 * O que a busca alcança.
 *
 * Inclui as telas fora da navegação — é a razão de o atalho continuar vivo.
 */
const ATALHOS: readonly NavItem[] = [...NAV, ...FORA_DA_NAVEGACAO];

export function Shell({ userName, children }: { userName: string; children: ReactNode }) {
  const pathname = usePathname();
  const [menuAberto, setMenuAberto] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [consulta, setConsulta] = useState("");
  const [rotaDaGaveta, setRotaDaGaveta] = useState(pathname);
  const navegacao = useRef<HTMLElement>(null);
  const fecharBusca = useCallback(() => setBuscaAberta(false), []);

  if (rotaDaGaveta !== pathname) {
    setRotaDaGaveta(pathname);
    setMenuAberto(false);
    setBuscaAberta(false);
  }

  // A lateral acende só pelos treze; o título da barra de cima também nomeia as
  // telas de fora dela. São perguntas diferentes: "onde estou na navegação" e
  // "que tela é esta".
  const atual =
    NAV.find((item) => rotaAtiva(item.href, pathname)) ??
    FORA_DA_NAVEGACAO.find((item) => rotaAtiva(item.href, pathname));
  const resultados = ATALHOS.filter((item) => normalizar(item.label).includes(normalizar(consulta)));

  useEffect(() => {
    function atalho(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setConsulta("");
        setBuscaAberta((aberta) => !aberta);
      }
    }
    document.addEventListener("keydown", atalho);
    return () => document.removeEventListener("keydown", atalho);
  }, []);

  useEffect(() => {
    if (!menuAberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focaveis = () =>
      [...(navegacao.current?.querySelectorAll<HTMLElement>("a[href], button") ?? [])].filter(
        (el) => el.getClientRects().length > 0,
      );
    focaveis()[0]?.focus();

    function tecla(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuAberto(false);
      if (event.key !== "Tab") return;
      const lista = focaveis();
      const primeiro = lista[0];
      const ultimo = lista.at(-1);
      if (event.shiftKey && document.activeElement === primeiro) {
        event.preventDefault();
        ultimo?.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primeiro?.focus();
      }
    }

    document.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", tecla);
      anterior?.focus();
    };
  }, [menuAberto]);

  return (
    <div className="app-shell">
      <a href="#conteudo" className="skip-link">
        Ir para o conteúdo
      </a>

      {menuAberto ? (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMenuAberto(false)}
          className="fixed inset-0 z-30 bg-canvas/75 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <nav
        ref={navegacao}
        id="navegacao"
        aria-label="Navegação principal"
        className={join(
          "finance-sidebar",
          menuAberto ? "visible translate-x-0" : "invisible -translate-x-[120%] lg:visible lg:translate-x-0",
        )}
      >
        <div className="flex h-full flex-col">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2">
            <Link
              href="/"
              aria-label="Fluxo — início"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent font-semibold text-accent-ink shadow-[0_0_22px_color-mix(in_oklab,var(--color-accent)_38%,transparent)]"
            >
              F
            </Link>
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-ink">Fluxo</p>
              <p className="metric-label">Financeiro</p>
            </div>
            <button
              type="button"
              onClick={() => setMenuAberto(false)}
              aria-label="Fechar menu"
              className="grid size-9 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-raised hover:text-ink lg:hidden"
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          <div className="mt-8 flex-1 space-y-1 overflow-y-auto pr-1">
            {NAV.map((item) => (
              <ItemDeNavegacao key={item.href} item={item} pathname={pathname} />
            ))}
          </div>

          <Link
            href="/configuracoes"
            aria-label={`Conta de ${userName}`}
            className="mt-5 flex items-center gap-3 rounded-xl border border-line bg-surface-inset/40 p-3 transition-colors hover:bg-surface-inset"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-wash text-caption font-semibold uppercase text-accent">
              {iniciais(userName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-medium text-ink">{userName}</span>
              <span className="block text-caption text-ink-subtle">Meu espaço pessoal</span>
            </span>
          </Link>
        </div>
      </nav>

      <div className="min-w-0 flex-1" inert={menuAberto || undefined}>
        <header className="topbar px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu"
              aria-controls="navegacao"
              aria-expanded={menuAberto}
              className="grid size-9 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-raised hover:text-ink lg:hidden"
            >
              <Menu size={16} aria-hidden />
            </button>
            <div className="min-w-0">
              <p className="metric-label">{mesCorrente()}</p>
              <h1 className="truncate text-lg font-semibold text-ink">{atual?.label ?? "Fluxo"}</h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/"
              aria-label="Avisos no TARS"
              className="grid size-9 place-items-center rounded-md text-ink-subtle transition-colors hover:bg-surface-raised hover:text-ink"
            >
              <Bell size={16} aria-hidden />
            </Link>
            <Link
              href="/lancamentos?novo=1"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-body-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
            >
              <Plus size={16} aria-hidden />
              <span className="hidden sm:inline">Novo</span>
            </Link>
          </div>
        </header>

        {/*
         * O `<main>` mora aqui, e não em cada tela.
         *
         * O link de pular para o conteúdo aponta para `#conteudo`. Enquanto a
         * âncora vivia na moldura de página, toda tela que não usasse a
         * moldura — as doze do Mesa — deixava o link apontando para o vazio.
         * Na casca ele existe uma vez e vale para todas.
         */}
        <main id="conteudo" tabIndex={-1} className="page-content min-w-0 pb-24 lg:pb-0">
          {children}
        </main>
      </div>

      <BottomNav onMenuOpen={() => setMenuAberto(true)} menuOpen={menuAberto} />

      <Dialog
        open={buscaAberta}
        onClose={fecharBusca}
        title="Aonde vamos?"
        description="Encontre uma área do seu Fluxo."
      >
        <label htmlFor="buscar-area" className="sr-only">
          Buscar área
        </label>
        <Input
          id="buscar-area"
          value={consulta}
          onChange={(event) => setConsulta(event.target.value)}
          placeholder="Metas, assinaturas, aparelhos…"
          autoComplete="off"
        />
        <ul className="mt-3 max-h-[55dvh] space-y-1 overflow-y-auto">
          {resultados.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => {
                  fecharBusca();
                  setMenuAberto(false);
                }}
                className="flex min-h-11 items-center gap-3 rounded-md px-3 text-body-sm text-ink-muted transition-colors hover:bg-accent-wash hover:text-accent"
              >
                <item.icon size={17} aria-hidden />
                <span className="flex-1">{item.label}</span>
                <ArrowRight size={14} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        {!resultados.length ? (
          <p className="py-6 text-center text-body-sm text-ink-muted">
            Nenhuma área encontrada. Tente outro nome.
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}

function ItemDeNavegacao({ item, pathname }: { item: NavItem; pathname: string }) {
  const ativo = rotaAtiva(item.href, pathname);
  const Icone = item.icon;

  return (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      className={join(
        "nav-item flex h-10 w-full items-center gap-3 rounded-xl px-3 text-body-sm font-medium transition-colors",
        ativo
          ? "bg-surface-inset text-ink-muted"
          : "text-ink hover:bg-surface-raised",
      )}
    >
      <Icone size={16} className="shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function rotaAtiva(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function normalizar(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/** "Setembro 2026" — o mesmo rótulo que o desenho põe acima do título. */
function mesCorrente(): string {
  const agora = new Date();
  const nome = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(agora);
  const ano = new Intl.DateTimeFormat("pt-BR", {
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(agora);
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} ${ano}`;
}
