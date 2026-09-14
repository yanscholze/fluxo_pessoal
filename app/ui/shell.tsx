"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BottomNav } from "./bottom-nav.tsx";
import { InstallApp } from "./install-app.tsx";
import { Dialog } from "./dialog.tsx";
import { Input } from "./controls.tsx";
import { gravarPreferencia, usePreferencia } from "./browser-preference.ts";
import {
  ArrowRight, BarChart3, Bot, Briefcase, ChevronRight, CreditCard, Landmark,
  LayoutDashboard, LogOut, type LucideIcon, Menu, Moon, PanelLeft,
  PanelLeftClose, Plane, Receipt, Repeat, Search, Settings, Sun, Wallet, X, Zap,
} from "./icons.tsx";
import { join } from "./primitives.tsx";

export type NavItem = { readonly href: string; readonly label: string; readonly icon: LucideIcon };
export type NavGroup = { readonly title: string; readonly items: readonly NavItem[] };

export const NAV: readonly NavGroup[] = [
  { title: "Seu espaço", items: [
    { href: "/", label: "TARS", icon: Bot },
    { href: "/painel", label: "Painel", icon: LayoutDashboard },
  ] },
  { title: "Financeiro", items: [
    { href: "/lancamentos", label: "Lançamentos", icon: Receipt },
    { href: "/contas", label: "Contas", icon: Landmark },
    { href: "/cartoes", label: "Cartões e faturas", icon: CreditCard },
    { href: "/planejamento", label: "Compromissos", icon: Repeat },
    { href: "/orcamentos", label: "Orçamentos", icon: Wallet },
    { href: "/patrimonio", label: "Visão geral", icon: BarChart3 },
  ] },
  { title: "Além do dia a dia", items: [
    { href: "/viagens", label: "Viagens", icon: Plane },
    { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
    { href: "/projetos", label: "Projetos", icon: Briefcase },
  ] },
  { title: "Organização", items: [
    { href: "/automaticos", label: "Automações e importações", icon: Zap },
  ] },
];
const SETTINGS: NavItem = { href: "/configuracoes", label: "Configurações", icon: Settings };
const CHAVE_RECOLHIDA = "fluxo:menu-recolhido";
const ATALHOS = [
  ...NAV.flatMap((grupo) => grupo.items), SETTINGS,
  { href: "/planejamento?aba=parcelamentos", label: "Parcelamentos", icon: Repeat },
  { href: "/planejamento?aba=recorrencias", label: "Recorrências", icon: Repeat },
  { href: "/planejamento?aba=assinaturas", label: "Assinaturas", icon: Repeat },
  { href: "/patrimonio?aba=investimentos", label: "Investimentos", icon: BarChart3 },
  { href: "/patrimonio?aba=metas", label: "Metas", icon: BarChart3 },
  { href: "/patrimonio?aba=saude", label: "Saúde financeira", icon: BarChart3 },
  { href: "/automaticos?aba=importacoes", label: "Importações", icon: Zap },
  { href: "/configuracoes?aba=aparelhos", label: "Aparelhos", icon: Settings },
];

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
  const recolhida = usePreferencia(() => localStorage.getItem(CHAVE_RECOLHIDA) === "1", false);
  const grupo = NAV.find((g) => g.items.some((item) => rotaAtiva(item.href, pathname)));
  const atual = grupo?.items.find((item) => rotaAtiva(item.href, pathname)) ?? SETTINGS;
  const resultados = ATALHOS.filter((item) => normalizar(item.label).includes(normalizar(consulta)));

  useEffect(() => {
    function atalho(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
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
    const focaveis = () => [...(navegacao.current?.querySelectorAll<HTMLElement>('a[href], button') ?? [])].filter((el) => el.getClientRects().length > 0);
    focaveis()[0]?.focus();
    function tecla(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuAberto(false);
      if (event.key !== "Tab") return;
      const lista = focaveis();
      const primeiro = lista[0], ultimo = lista.at(-1);
      if (event.shiftKey && document.activeElement === primeiro) { event.preventDefault(); ultimo?.focus(); }
      else if (!event.shiftKey && document.activeElement === ultimo) { event.preventDefault(); primeiro?.focus(); }
    }
    document.addEventListener("keydown", tecla);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", tecla); anterior?.focus(); };
  }, [menuAberto]);

  return (
    <div className="app-shell flex min-h-dvh bg-canvas">
      <a href="#conteudo" className="skip-link">Ir para o conteúdo</a>
      {menuAberto ? <button type="button" aria-label="Fechar menu" onClick={() => setMenuAberto(false)} className="fixed inset-0 z-30 bg-canvas/75 backdrop-blur-sm lg:hidden" /> : null}
      <nav ref={navegacao} id="navegacao" aria-label="Navegação principal" className={join(
        "app-sidebar fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-line bg-surface transition-[transform,width] duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
        menuAberto ? "visible translate-x-0" : "invisible -translate-x-full lg:visible",
        recolhida ? "w-[16.5rem] lg:w-[4.75rem]" : "w-[16.5rem]",
      )}>
        <div className={join("flex h-16 shrink-0 items-center gap-3 px-5", recolhida && "lg:justify-center lg:px-0")}>
          <Link href="/" className="flex items-center gap-3" aria-label="Fluxo — início">
            <span className="brand-mark" aria-hidden><svg viewBox="0 0 24 24" fill="none"><path d="M4 17c3.3 0 3.5-10 7-10s3.7 10 7 10M14 7h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></span>
            <span className={join("text-2xl font-semibold tracking-tight text-ink", recolhida && "lg:hidden")}>Fluxo<span className="text-accent">.</span></span>
          </Link>
          <button type="button" onClick={() => setMenuAberto(false)} aria-label="Fechar menu" className="ml-auto flex size-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-inset lg:hidden"><X size={19} aria-hidden /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((g) => <div key={g.title} className="mb-3 last:mb-0">
            <p className={join("px-3 pb-2 pt-1 text-label uppercase text-ink-subtle", recolhida && "lg:sr-only")}>{g.title}</p>
            <ul className="space-y-1">{g.items.map((item) => <li key={item.href}><ItemDeNavegacao item={item} pathname={pathname} recolhida={recolhida} /></li>)}</ul>
          </div>)}
        </div>
        <div className="shrink-0 border-t border-line p-3">
          <ItemDeNavegacao item={SETTINGS} pathname={pathname} recolhida={recolhida} />
          <InstallApp className={join("my-2 w-full", recolhida && "lg:hidden")} />
          <Link href="/configuracoes" className={join("mt-1 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-inset", recolhida && "lg:justify-center")} aria-label={`Conta de ${userName}`}>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-accent-edge bg-accent-wash text-caption font-semibold uppercase text-accent">{iniciais(userName)}</span>
            <span className={join("min-w-0 flex-1", recolhida && "lg:hidden")}><span className="block truncate text-body-sm font-medium text-ink">{userName}</span><span className="block text-caption text-ink-subtle">Meu espaço pessoal</span></span>
          </Link>
          <div className={join("mt-1 flex gap-1", recolhida && "lg:flex-col")}>
            <BotaoDeTema recolhida={recolhida} /><BotaoDeSaida recolhida={recolhida} />
            <button type="button" onClick={() => gravarPreferencia(() => {}, CHAVE_RECOLHIDA, recolhida ? "0" : "1")} aria-label={recolhida ? "Expandir menu" : "Recolher menu"} title={recolhida ? "Expandir menu" : "Recolher menu"} className="hidden size-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-inset lg:inline-flex">{recolhida ? <PanelLeft size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}</button>
          </div>
        </div>
      </nav>
      <div className="min-w-0 flex-1" inert={menuAberto || undefined}>
        <header className="app-topbar sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMenuAberto(true)} aria-label="Abrir menu" aria-controls="navegacao" aria-expanded={menuAberto} className="flex size-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-inset lg:hidden"><Menu size={19} aria-hidden /></button>
            <span className="hidden text-caption text-ink-subtle sm:inline">{grupo?.title ?? "Seu espaço"}</span><ChevronRight size={13} className="hidden text-ink-subtle sm:block" aria-hidden />
            <span className="truncate text-body-sm font-medium text-ink">{atual.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setConsulta(""); setBuscaAberta(true); }} className="flex h-10 items-center gap-2 rounded-md border border-line px-3 text-caption text-ink-muted transition-colors hover:border-accent-edge hover:text-ink" aria-label="Buscar uma área do app"><Search size={15} aria-hidden /><span className="hidden sm:inline">Ir para…</span><kbd className="ml-4 hidden text-label text-ink-subtle lg:inline">Ctrl K</kbd></button>
            <Link href="/#pendencias" className="flex size-10 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-accent-wash hover:text-accent" aria-label="Ver pendências no TARS"><Bot size={19} aria-hidden /></Link>
          </div>
        </header>
        <div className="min-w-0 pb-24 lg:pb-0">{children}</div>
      </div>
      <BottomNav onMenuOpen={() => setMenuAberto(true)} menuOpen={menuAberto} />
      <Dialog open={buscaAberta} onClose={fecharBusca} title="Aonde vamos?" description="Encontre uma área do seu Fluxo.">
        <label htmlFor="buscar-area" className="sr-only">Buscar área</label>
        <Input id="buscar-area" value={consulta} onChange={(event) => setConsulta(event.target.value)} placeholder="Metas, assinaturas, aparelhos…" autoComplete="off" />
        <ul className="mt-3 max-h-[55dvh] space-y-1 overflow-y-auto">
          {resultados.map((item) => <li key={item.href}><Link href={item.href} onClick={() => { fecharBusca(); setMenuAberto(false); }} className="flex min-h-11 items-center gap-3 rounded-md px-3 text-body-sm text-ink-muted hover:bg-accent-wash hover:text-accent"><item.icon size={17} aria-hidden /><span className="flex-1">{item.label}</span><ArrowRight size={14} aria-hidden /></Link></li>)}
        </ul>
        {!resultados.length ? <p className="py-6 text-center text-body-sm text-ink-muted">Nenhuma área encontrada. Tente outro nome.</p> : null}
      </Dialog>
    </div>
  );
}
function normalizar(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function rotaAtiva(href: string, pathname: string) { return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`); }
function ItemDeNavegacao({ item, pathname, recolhida }: { item: NavItem; pathname: string; recolhida: boolean }) {
  const ativo = rotaAtiva(item.href, pathname);
  const Icone = item.icon;
  return <Link href={item.href} aria-current={ativo ? "page" : undefined} title={recolhida ? item.label : undefined} className={join("nav-item relative flex min-h-9 items-center gap-3 rounded-md px-3 py-1.5 text-body-sm transition-colors", recolhida && "lg:justify-center lg:px-0", ativo ? "bg-accent-wash font-medium text-accent" : "text-ink-muted hover:bg-surface-inset hover:text-ink")}>
    {ativo ? <span className="absolute -left-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent" aria-hidden /> : null}
    <Icone size={17} strokeWidth={1.6} className="shrink-0" aria-hidden /><span className={join("leading-snug", recolhida && "lg:hidden")}>{item.label}</span>
    {item.href === "/" ? <span className={join("ml-auto size-1.5 shrink-0 rounded-full bg-accent", recolhida && "lg:hidden")} aria-hidden /> : null}
  </Link>;
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
        "inline-flex size-10 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-inset hover:text-ink",
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
        "inline-flex size-10 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-negative-wash hover:text-negative",
        recolhida ? "" : "flex-1",
      )}
    >
      <LogOut size={16} strokeWidth={1.5} aria-hidden />
    </button>
  );
}
