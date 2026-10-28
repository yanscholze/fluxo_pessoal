"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../controls.tsx";
import { Dialog } from "../dialog.tsx";
import { Bell, Check, Sparkles } from "../icons.tsx";
import { Badge, type Tone } from "../primitives.tsx";
import type { NotificationItem, NotificationsState } from "./contracts.ts";

const CATEGORY: Record<NotificationItem["category"], { label: string; tone: Tone }> = {
  critical: { label: "Crítica", tone: "negative" },
  attention: { label: "Atenção", tone: "caution" },
  insight: { label: "Insight", tone: "info" },
  opportunity: { label: "Oportunidade", tone: "positive" },
  reminder: { label: "Lembrete", tone: "neutral" },
};

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
function safeHref(href: string | undefined): string { return href?.startsWith("/") && !href.startsWith("//") ? href : "/painel"; }

function useNotifications() {
  const [state, setState] = useState<NotificationsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(false);
  const previous = useRef<Set<string> | null>(null);
  const running = useRef(false);
  const marking = useRef(false);
  const lastRequest = useRef(0);
  const requestVersion = useRef(0);

  const refresh = useCallback(async (force = false) => {
    // Focus + visibilitychange often arrive together. Navigation keeps this
    // mounted centre, so neither event needs another immediate network read.
    if (running.current || marking.current || !force && Date.now() - lastRequest.current < 15_000) return;
    running.current = true;
    lastRequest.current = Date.now();
    const version = ++requestVersion.current;
    try {
      const response = await fetch("/api/v1/alerts", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Não foi possível carregar as notificações.");
      const data = body.data as NotificationsState;
      if (version !== requestVersion.current) return;
      if (previous.current && data.alerts.some((item) => !item.readAt && item.priority >= 4 && !previous.current!.has(`${item.id}:${item.revision ?? 1}`))) setFresh(true);
      previous.current = new Set(data.alerts.map((item) => `${item.id}:${item.revision ?? 1}`));
      setState(data);
      setError(null);
    } catch (problem) { if (version === requestVersion.current) setError(problem instanceof Error ? problem.message : "Não foi possível carregar as notificações."); }
    finally { running.current = false; }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
    const update = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    window.addEventListener("fluxo:notifications-refresh", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); window.removeEventListener("fluxo:notifications-refresh", update); document.removeEventListener("visibilitychange", update); };
  }, [refresh]);

  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(() => setFresh(false), 8000);
    return () => clearTimeout(timer);
  }, [fresh]);

  async function mark(ids?: string[]) {
    if (marking.current) return;
    marking.current = true;
    const version = ++requestVersion.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/alerts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(ids ? { ids } : { all: true }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Não foi possível marcar como lida.");
      const data = body.data as NotificationsState;
      if (version !== requestVersion.current) return;
      previous.current = new Set(data.alerts.map((item) => `${item.id}:${item.revision ?? 1}`));
      lastRequest.current = Date.now();
      setState(data);
    } catch (problem) { setError(problem instanceof Error ? problem.message : "Não foi possível atualizar a leitura."); }
    finally { marking.current = false; setBusy(false); }
  }
  return { state, error, busy, fresh, setFresh, refresh, mark };
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"unread" | "all" | "resolved">("unread");
  const { state, error, busy, fresh, setFresh, refresh, mark } = useNotifications();
  const close = useCallback(() => setOpen(false), []);
  const unread = state?.unreadCount ?? 0;
  const alerts = filter === "resolved" ? state?.history ?? [] : (state?.alerts ?? []).filter((item) => filter === "all" || !item.readAt);
  return <>
    <button type="button" onClick={() => { setOpen(true); setFresh(false); void refresh(true); }} aria-label={state ? `Notificações, ${unread} não lida${unread === 1 ? "" : "s"}` : "Abrir notificações"} title="Notificações" className={`fluxo-top-icon relative flex size-11 items-center justify-center text-ink-muted transition-colors hover:text-accent ${fresh ? "ring-2 ring-accent ring-offset-2 ring-offset-canvas" : ""}`}>
      <Bell size={18} aria-hidden />{unread > 0 ? <span aria-hidden className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-negative px-1 text-[11px] font-bold leading-none text-white">{unread > 99 ? "99+" : unread}</span> : null}
    </button>
    <span role="status" className="sr-only">{fresh ? "Você tem uma nova notificação importante." : ""}</span>
    <Dialog open={open} onClose={close} title="Notificações" description="O que merece sua atenção. Abrir esta central não marca os avisos como lidos." width="lg">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><p className="text-body-sm text-ink-muted">{unread} não lida{unread === 1 ? "" : "s"}</p><Button icon={Check} disabled={!unread || busy} busy={busy} onClick={() => void mark()}>Marcar todas como lidas</Button></div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filtrar notificações">{([["unread", "Não lidas"], ["all", "Todas"], ["resolved", "Resolvidas"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 rounded-full border px-3 text-body-sm ${filter === value ? "border-accent-edge bg-accent-wash text-accent" : "border-line text-ink-muted"}`}>{label}</button>)}</div>
      {error ? <div role="alert" className="mb-4 rounded-md bg-negative-wash p-3 text-body-sm text-negative">{error}<button type="button" onClick={() => void refresh(true)} className="ml-2 min-h-11 underline">Tentar novamente</button></div> : null}
      {!state && !error ? <p role="status" className="py-5 text-body-sm text-ink-muted">Carregando notificações…</p> : null}
      {state && !alerts.length ? <p className="py-7 text-center text-body-sm text-ink-muted">{filter === "unread" ? "Tudo conferido. Os avisos lidos continuam na aba Todas." : filter === "resolved" ? "Nenhum aviso resolvido no histórico." : "Nenhuma notificação por aqui. Os próximos avisos importantes aparecerão neste espaço."}</p> : null}
      <ul className="space-y-3">{alerts.map((item) => <NotificationRow key={item.id} item={item} disabled={busy} onMark={mark} onClose={close} />)}</ul>
    </Dialog>
  </>;
}

function NotificationRow({ item, disabled, onMark, onClose }: { item: NotificationItem; disabled: boolean; onMark: (ids: string[]) => Promise<void>; onClose: () => void }) {
  const category = CATEGORY[item.category] ?? CATEGORY.reminder;
  return <li className={`rounded-xl border p-4 ${item.readAt || item.resolvedAt ? "border-line bg-surface" : "border-accent-edge bg-accent-wash"}`}>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge tone={category.tone}>{category.label}</Badge>{!item.resolvedAt ? <span className={`text-caption ${item.readAt ? "text-ink-subtle" : "font-semibold text-accent"}`}>{item.readAt ? "Lida" : "Não lida"}</span> : null}{item.resolvedAt ? <Badge tone="neutral">Resolvida</Badge> : null}</div><time dateTime={item.createdAt} className="text-caption text-ink-subtle">{dateLabel(item.createdAt)}</time></div>
    <h3 className="text-body font-semibold text-ink">{item.title}</h3><p className="mt-1 text-body-sm text-ink-muted">{item.body}</p>
    <div className="mt-3 flex flex-wrap items-center gap-3"><Link prefetch={false} href={safeHref(item.href)} onClick={() => { if (!item.readAt) void onMark([item.id]); onClose(); }} className="inline-flex min-h-11 items-center text-body-sm font-medium text-accent">Ver detalhes →</Link>{item.askPrompt ? <Link prefetch={false} href={`/?notificationId=${encodeURIComponent(item.id)}`} onClick={() => { if (!item.readAt) void onMark([item.id]); onClose(); }} className="inline-flex min-h-11 items-center gap-2 text-body-sm font-medium text-accent"><Sparkles size={15} aria-hidden />Perguntar à IA</Link> : null}{!item.readAt && !item.resolvedAt ? <Button disabled={disabled} icon={Check} variant="ghost" onClick={() => void onMark([item.id])}>Marcar como lida</Button> : null}</div>
  </li>;
}
