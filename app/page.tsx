"use client";

import NextImage from "next/image";
import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Award, Banknote, Bell, CalendarDays,
  ChartNoAxesCombined, Check, ChevronLeft, ChevronRight,
  Camera, CircleDollarSign, Cloud, CloudOff, Coins, CreditCard, Download, FileJson, FileUp, Gift, GripVertical,
  Landmark, LayoutDashboard, LockKeyhole, LogOut, MapPin, Menu, Moon, MoreHorizontal, Pencil, PiggyBank, Plane, Plus, RotateCcw,
  History, KeyRound, MessageSquare, ReceiptText, RefreshCw, Search, Send, Settings2, Sparkles, Sun,
  Tags, Target, Trash2, TrendingUp, UserPlus, WalletCards, X, Repeat2,
} from "lucide-react";
import { clearFinanceLocalData, useFinanceSync, type SyncStatus } from "./use-finance-sync";
import { businessDaysInMonth, effectiveRecurringDate } from "../lib/brazil-calendar";
import { parseCsv, parseOfx } from "../lib/import-parser";
import { rewardFor, rewardSnapshot } from "../lib/rewards";
import { accountBalanceAtMonth, calendarMonthOf, contextualFinancialTip, defaultInvoiceMonthForCard, financialMonthOf, invoiceClosingDate, invoiceDueDate, transactionsForCommitmentMonth, transactionsForMonth } from "../lib/finance-period";
import { DEFAULT_DASHBOARD_WIDGET_ORDER, normalizeDashboardWidgetOrder, reorderDashboardWidgets, type DashboardWidgetId } from "../lib/dashboard-layout";
import { tripExpenseSummary, tripTotalInCurrency } from "../lib/travel";
import type {
  FinanceAccount, FinanceBenefitRule, FinanceCard, FinanceCategory, FinanceExchangeRate,
  FinanceRecurringRule, FinanceRewardRedemption, FinanceSalaryRule, FinanceTransaction, FinanceTrip, PaymentMethod, TransactionType,
} from "../lib/finance-types";

type View = "Visão geral" | "Lançamentos" | "Contas" | "Cartões" | "Viagens" | "Planejamento" | "Relatórios" | "Configurações";
type Theme = "light" | "dark";
type MonthOption = { key: string; label: string };
type DashboardWidgetLayout = "desktop" | "mobile";
type DashboardMetric = { id: DashboardWidgetId; label: string; value: string; note: string; icon: typeof LayoutDashboard; tone: string; target: View };
type SessionUser = { id: string; email: string; displayName: string };
type ProfileFeedback = { id: string; senderOwnerId: string; senderName: string; message: string; status: string; developerComment?: string | null; createdAt: string; updatedAt: string };
type ProfilePayload = { user: SessionUser & { avatarData?: string | null }; isDeveloper: boolean; feedback: ProfileFeedback[] };
type FinancialCoachResult = { answer: string; summary: string; actions: Array<{ label: string; reason: string; priority: "high" | "medium" | "low" }>; warnings: string[] };
type AppNotification = { id: string; kind: string; title: string; message: string; feedbackId?: string | null; readAt?: string | null; createdAt: string };
type NotificationsPayload = { notifications: AppNotification[]; unreadCount: number };

const navItems: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: "Visão geral", icon: LayoutDashboard }, { label: "Lançamentos", icon: ReceiptText },
  { label: "Contas", icon: WalletCards }, { label: "Cartões", icon: CreditCard },
  { label: "Viagens", icon: Plane },
  { label: "Planejamento", icon: Target }, { label: "Relatórios", icon: ChartNoAxesCombined },
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pointsNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const monthBase = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
const monthOptions: MonthOption[] = Array.from({ length: 121 }, (_, index) => {
  const date = new Date(Date.UTC(monthBase.getUTCFullYear(), monthBase.getUTCMonth() + index - 60, 1));
  return {
    key: date.toISOString().slice(0, 7),
    label: monthFormatter.format(date).replace(/^./, (letter) => letter.toUpperCase()),
  };
});
const currentMonthIndex = 60;

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function shortDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date).replace(".", "");
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function addMonths(value: string, offset: number) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function invoiceMonthForPurchase(date: string, card: FinanceCard) {
  const calendarMonth = date.slice(0, 7);
  const closingDate = effectiveRecurringDate(calendarMonth, card.closingDay, "day-of-month", "previous");
  return date > closingDate ? addMonths(date, 1).slice(0, 7) : calendarMonth;
}

function totalsFor(items: FinanceTransaction[]) {
  const expenses = items.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const income = items.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  return { expenses, income, free: income - expenses };
}

function parseMoney(value: string) {
  const cleaned = value.replace(/[R$\s"]/g, "");
  return Number(cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned);
}

function formatInput(value: number) { return String(value).replace(".", ","); }
function isCardAccount(name: string) { return /ultravioleta|black/i.test(name); }
function foreignMoney(value: number, currency: string) {
  try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value); }
  catch { return `${currency} ${pointsNumber.format(value)}`; }
}

export default function HomePage() {
  const [session, setSession] = useState<{ loading: boolean; user: SessionUser | null }>({ loading: true, user: null });
  useEffect(() => {
    let active = true;
    fetch("/api/auth", { headers: { accept: "application/json" }, cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<{ user: SessionUser }> : null)
      .then((payload) => { if (active) setSession({ loading: false, user: payload?.user ?? null }); })
      .catch(() => { if (active) setSession({ loading: false, user: null }); });
    return () => { active = false; };
  }, []);
  if (session.loading) return <main className="auth-shell"><div className="auth-loading"><span className="brand-mark"><TrendingUp size={22} /></span><strong>Fluxo</strong><small>Preparando seu espaço financeiro…</small></div></main>;
  if (!session.user) return <AuthScreen onAuthenticated={(user) => setSession({ loading: false, user })} />;
  return <FinanceApplication user={session.user} onLogout={async () => {
    const response = await fetch("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    if (!response.ok) throw new Error("Não foi possível encerrar esta sessão");
    clearFinanceLocalData(session.user!.id);
    setSession({ loading: false, user: null });
  }} />;
}

function FinanceApplication({ user, onLogout }: { user: SessionUser; onLogout: () => Promise<void> }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [view, setView] = useState<View>("Visão geral");
  const [monthIndex, setMonthIndex] = useState(currentMonthIndex);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinanceTransaction | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [incomeRulesOpen, setIncomeRulesOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinanceAccount | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<FinanceCard | null>(null);
  const [tripOpen, setTripOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<FinanceTrip | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [profileUser, setProfileUser] = useState<SessionUser & { avatarData?: string | null }>(user);
  const firstName = profileUser.displayName.trim().split(/\s+/)[0] || profileUser.email.split("@")[0];
  const [greeting, setGreeting] = useState(`Olá, ${firstName}`);
  const finance = useFinanceSync(user.id);
  const { transactions, accounts, categories, cards, trips, rewardRedemptions, salaryRule, benefitRule, recurringRules, exchangeRate, status } = finance;

  const selectedMonth = monthOptions[monthIndex];
  const monthTransactions = useMemo(() => transactionsForMonth(transactions, selectedMonth.key), [transactions, selectedMonth.key]);
  const totals = useMemo(() => totalsFor(monthTransactions), [monthTransactions]);
  const balanceTotal = accounts.filter((item) => item.kind !== "credit-card").reduce((sum, item) => sum + accountBalanceAtMonth(item, transactions, selectedMonth.key), 0);
  const creditAccounts = new Set(cards.filter((card) => card.kind === "credit").map((card) => card.linkedAccount));
  const cardMonthTransactions = transactions.filter((item) => (item.invoiceMonth ?? item.date.slice(0, 7)) === selectedMonth.key);
  const cardInvoiceGross = cardMonthTransactions.filter((item) => item.type === "expense" && (item.paymentMethod === "credit" || (!item.cardId && creditAccounts.has(item.account)))).reduce((sum, item) => sum + item.amount, 0);
  const cardInvoicePaid = cardMonthTransactions.filter((item) => item.type === "transfer" && item.source === "invoice-payment").reduce((sum, item) => sum + item.amount, 0);
  const cardInvoice = Math.max(0, cardInvoiceGross - cardInvoicePaid);
  const nextMonthKey = monthOptions[Math.min(monthIndex + 1, monthOptions.length - 1)].key;
  const nextCommitted = transactionsForCommitmentMonth(transactions, nextMonthKey).filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  const salaryDone = Boolean(salaryRule?.lastConfirmedMonth === selectedMonth.key || monthTransactions.some((item) => item.fingerprint === `recurring:${salaryRule?.id}:${selectedMonth.key}`));
  const benefitDone = !benefitRule?.active || Boolean(benefitRule.lastConfirmedMonth === selectedMonth.key || monthTransactions.some((item) => item.fingerprint === `recurring:${benefitRule.id}:${selectedMonth.key}`));
  const salaryConfirmed = salaryDone && benefitDone;

  useEffect(() => {
    const stored = window.localStorage.getItem("fluxo-theme");
    const frame = window.requestAnimationFrame(() => {
      if (stored === "light" || stored === "dark") setTheme(stored);
      const hour = new Date().getHours();
      setGreeting(`${hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"}, ${firstName}`);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [firstName]);
  useEffect(() => {
    let active = true;
    fetch("/api/v1/profile", { cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<ProfilePayload> : null).then((payload) => { if (active && payload?.user) setProfileUser(payload.user); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    window.localStorage.setItem("fluxo-theme", theme);
    document.documentElement.style.colorScheme = theme;
    const canvasColor = theme === "light" ? "#ffffff" : "#0b1118";
    document.documentElement.style.backgroundColor = canvasColor;
    document.body.style.backgroundColor = canvasColor;
  }, [theme]);

  async function refreshNotifications() {
    try {
      const response = await fetch("/api/v1/notifications", { cache: "no-store" });
      const payload = await response.json() as NotificationsPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar as notificações");
      setNotifications(payload.notifications); setUnreadCount(payload.unreadCount);
    } catch { /* tenta novamente no próximo ciclo */ }
  }
  useEffect(() => {
    const initial = window.setTimeout(() => void refreshNotifications(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refreshNotifications(); }, 30_000);
    const visible = () => { if (document.visibilityState === "visible") void refreshNotifications(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, []);
  async function notificationAction(action: "mark-read" | "mark-all-read", id?: string) {
    setNotificationsBusy(true);
    try {
      const response = await fetch("/api/v1/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id }) });
      const payload = await response.json() as NotificationsPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar as notificações");
      setNotifications(payload.notifications); setUnreadCount(payload.unreadCount);
    } catch (reason) { flash(reason instanceof Error ? reason.message : "Não foi possível atualizar as notificações"); }
    finally { setNotificationsBusy(false); }
  }

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3200);
  }
  function selectMonth(key: string) {
    const index = monthOptions.findIndex((item) => item.key === key);
    if (index >= 0) setMonthIndex(index);
  }
  function navigate(next: View) { setView(next); setSidebarOpen(false); }
  async function secureLogout() {
    if (["saving", "offline", "error"].includes(status) && !window.confirm("Há dados que podem ainda não ter sincronizado. Se sair agora, alterações apenas locais podem não ser recuperadas. Deseja continuar?")) return;
    try { await onLogout(); } catch (error) { flash(error instanceof Error ? error.message : "Não foi possível sair"); }
  }
  function openTransaction(item: FinanceTransaction | null = null) { setEditingTransaction(item); setTransactionOpen(true); }

  async function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const amount = parseMoney(String(data.get("amount") ?? "0"));
    if (!amount || amount <= 0) return;
    const type = String(data.get("type")) as TransactionType;
    const method = (type === "expense" ? String(data.get("paymentMethod") || "debit") : "transfer") as PaymentMethod;
    const selectedCard = cards.find((card) => card.id === String(data.get("cardId") || ""));
    const account = method === "credit" && selectedCard ? selectedCard.linkedAccount : String(data.get("account") || "Nubank");
    const destinationAccount = type === "transfer" ? String(data.get("destinationAccount") || "") : undefined;
    const description = String(data.get("description") || "Novo lançamento").trim();
    const category = String(data.get("category") || (type === "income" ? "Salário" : "Outros"));
    const date = String(data.get("date") || new Date().toISOString().slice(0, 10));
    const tripId = String(data.get("tripId") || "") || undefined;
    if (editingTransaction) {
      const status = data.get("status") === "planned" ? "planned" : "confirmed";
      const reward = method === "credit" && selectedCard ? rewardSnapshot(amount, selectedCard, exchangeRate?.sell ?? 0) : {};
      try {
        const synced = await finance.addTransactions([{ ...editingTransaction, description, category, account, destinationAccount, date, amount, type, paymentMethod: method, cardId: method === "credit" ? selectedCard?.id ?? editingTransaction.cardId : undefined, tripId, invoiceMonth: method === "credit" && selectedCard ? invoiceMonthForPurchase(date, selectedCard) : undefined, ...reward, status, source: type === "transfer" ? "account-transfer" : editingTransaction.source }]);
        setTransactionOpen(false);
        setEditingTransaction(null);
        flash(synced ? "Lançamento atualizado e indicadores recalculados" : "Lançamento salvo e aguardando sincronização");
      } catch (error) { flash(error instanceof Error ? error.message : "Não foi possível salvar o lançamento"); }
      return;
    }
    const requestedCount = Math.trunc(Number(data.get("installmentCount") || 1));
    const installmentCount = type === "expense" && method === "credit" ? Math.min(48, Math.max(1, requestedCount)) : 1;
    const totalCents = Math.round(amount * 100);
    const baseCents = Math.floor(totalCents / installmentCount);
    const remainder = totalCents - baseCents * installmentCount;
    const groupId = createId();
    const firstInvoiceMonth = method === "credit" && selectedCard ? invoiceMonthForPurchase(date, selectedCard) : undefined;
    const items = Array.from({ length: installmentCount }, (_, index): FinanceTransaction => {
      const installmentAmount = (baseCents + (index < remainder ? 1 : 0)) / 100;
      const reward = method === "credit" && selectedCard ? rewardSnapshot(installmentAmount, selectedCard, exchangeRate?.sell ?? 0) : {};
      return {
        id: `${groupId}-${index + 1}`, description, category: type === "transfer" ? "Transferência" : category, account, destinationAccount, date: addMonths(date, index),
        amount: installmentAmount, type, paymentMethod: method,
        cardId: selectedCard?.id, tripId, invoiceMonth: firstInvoiceMonth ? addMonths(`${firstInvoiceMonth}-${date.slice(8, 10)}`, index).slice(0, 7) : undefined, installments: installmentCount > 1 ? `${index + 1}/${installmentCount}` : undefined,
        ...reward, status: "confirmed", source: type === "transfer" ? "account-transfer" : "manual",
      };
    });
    try {
      const synced = await finance.addTransactions(items);
      setTransactionOpen(false);
      flash(!synced ? "Lançamento salvo e aguardando sincronização" : installmentCount > 1 ? `Compra distribuída em ${installmentCount} faturas` : type === "income" ? "Entrada adicionada ao saldo" : method === "credit" ? "Compra adicionada à fatura e ao limite" : "Despesa debitada do saldo");
    } catch (error) { flash(error instanceof Error ? error.message : "Não foi possível salvar o lançamento"); }
  }

  async function removeEditingTransaction() {
    if (!editingTransaction) return;
    try {
      await finance.removeTransaction(editingTransaction.id);
      setTransactionOpen(false);
      setEditingTransaction(null);
      flash("Lançamento excluído e saldo corrigido");
    } catch (error) { flash(error instanceof Error ? error.message : "Não foi possível excluir"); }
  }

  async function confirmIncome() {
    try {
      await finance.confirmSalary(selectedMonth.key);
      flash("Salário e VA confirmados nos saldos corretos");
    } catch (error) { flash(error instanceof Error ? error.message : "Não foi possível confirmar as receitas"); }
  }

  function openReserve() {
    setEditingAccount(accounts.find((item) => item.fixed && item.name === "Reserva de emergência") ?? accounts.find((item) => item.kind === "investment") ?? {
      id: "", name: "Reserva de emergência", institution: "manual", kind: "investment", balance: 0, goal: 0, monthlyYieldPercent: 0, fixed: true, color: "green",
    });
    setAccountOpen(true);
  }

  return <div className="app-shell" data-theme={theme}>
    <Sidebar view={view} open={sidebarOpen} user={profileUser} onLogout={secureLogout} onNavigate={navigate} onClose={() => setSidebarOpen(false)} />
    <main className="main-content">
      <header className="topbar">
        <div className="topbar-title"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><div><p className="eyebrow">{view}</p><h1>{view === "Visão geral" ? greeting : view}</h1></div></div>
        <div className="topbar-actions">
          {view !== "Configurações" && view !== "Viagens" && <div className="month-picker" aria-label="Selecionar mês"><button className="icon-button compact" onClick={() => setMonthIndex((index) => Math.max(0, index - 1))} aria-label="Mês anterior"><ChevronLeft size={17} /></button><CalendarDays size={18} /><span>{selectedMonth.label}</span><button className="icon-button compact" onClick={() => setMonthIndex((index) => Math.min(monthOptions.length - 1, index + 1))} aria-label="Próximo mês"><ChevronRight size={17} /></button></div>}
          <SyncPill status={status} onRetry={finance.retrySync} />
          <button className="icon-button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Alternar tema">{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</button>
          <button className={`icon-button notification-button desktop-only ${unreadCount ? "has-unread" : ""}`} aria-label={unreadCount ? `${unreadCount} notificações não lidas` : "Notificações"} onClick={() => { setNotificationsOpen(true); void refreshNotifications(); }}><Bell size={19} />{unreadCount > 0 && <span className="notification-count">{Math.min(unreadCount, 99)}</span>}</button>
          <button className="primary-button" onClick={() => openTransaction()}><Plus size={18} /> <span>Novo lançamento</span></button>
        </div>
      </header>

      {view === "Visão geral" ? <Dashboard
        transactions={transactions} monthTransactions={monthTransactions} selectedMonth={selectedMonth} totals={totals}
        accounts={accounts} categories={categories} cards={cards} salaryRule={salaryRule} benefitRule={benefitRule} salaryConfirmed={salaryConfirmed}
        balanceTotal={balanceTotal} cardInvoice={cardInvoice} nextCommitted={nextCommitted}
        onNavigate={navigate} onConfirmIncome={() => void confirmIncome()} onConfigureIncome={() => setIncomeRulesOpen(true)} onOpenReserve={openReserve}
      /> : view === "Configurações" ? <SettingsView user={profileUser} finance={{ transactions, accounts, categories, cards, trips, rewardRedemptions, salaryRule, benefitRule, recurringRules }} onUser={setProfileUser} onLogout={secureLogout} onFlash={flash} /> : <ProductView
        view={view} transactions={transactions} monthTransactions={monthTransactions} accounts={accounts} categories={categories} cards={cards} trips={trips} rewardRedemptions={rewardRedemptions} recurringRules={recurringRules}
        salaryRule={salaryRule} benefitRule={benefitRule} exchangeRate={exchangeRate} selectedMonth={selectedMonth} totals={totals}
        onNew={() => openTransaction()} onImport={() => setImportOpen(true)} onConfigureIncome={() => setIncomeRulesOpen(true)}
        onCategories={() => setCategoryOpen(true)} onEditTransaction={openTransaction}
        onRecurring={() => setRecurringOpen(true)}
        onEditAccount={(account) => { setEditingAccount(account); setAccountOpen(true); }}
        onEditCard={(card) => { setEditingCard(card); setCardOpen(true); }}
        onEditTrip={(trip) => { setEditingTrip(trip); setTripOpen(true); }}
        onSelectMonth={selectMonth}
        onPayInvoice={async (payment) => { const result = await finance.payInvoice(payment); flash(`Fatura paga. Restante: ${brl.format(result.remaining)}`); }}
        onRedeemReward={async (redemption) => { await finance.redeemReward(redemption); flash(redemption.kind === "points" ? "Pontos resgatados e saldo atualizado" : "Cashback transferido para a conta selecionada"); }}
      />}
    </main>

    <nav className="mobile-nav" aria-label="Navegação principal">{navItems.slice(0, 5).map(({ label, icon: Icon }) => <button key={label} className={view === label ? "active" : ""} onClick={() => navigate(label)}><Icon size={20} /><span>{label === "Visão geral" ? "Início" : label}</span></button>)}</nav>
    <button className="mobile-quick-add" onClick={() => openTransaction()} aria-label="Novo lançamento rápido"><Plus size={24} /><span>Lançamento</span></button>

    {transactionOpen && <TransactionModal editing={editingTransaction} categories={categories} accounts={accounts.filter((item) => item.kind !== "credit-card")} cards={cards} trips={trips} onClose={() => { setTransactionOpen(false); setEditingTransaction(null); }} onSubmit={saveTransaction} onDelete={editingTransaction ? () => void removeEditingTransaction() : undefined} />}
    {importOpen && <ImportModal accounts={accounts.map((item) => item.name)} cards={cards} defaultInvoiceMonth={selectedMonth.key} onClose={() => setImportOpen(false)} onReady={async (items, name) => { try { const enriched = items.map((item) => { const card = cards.find((candidate) => candidate.id === item.cardId); return card && item.type === "expense" ? { ...item, ...rewardSnapshot(item.amount, card, exchangeRate?.sell ?? 0) } : item; }); const synced = await finance.addTransactions(enriched); setImportOpen(false); flash(synced ? `${items.length} lançamentos importados de ${name}` : `${items.length} lançamentos salvos e aguardando sincronização`); } catch (error) { flash(error instanceof Error ? error.message : "Não foi possível concluir a importação"); throw error; } }} />}
    {incomeRulesOpen && <IncomeRulesModal salary={salaryRule} benefit={benefitRule} accounts={accounts.filter((item) => item.kind !== "credit-card")} onClose={() => setIncomeRulesOpen(false)} onSave={async (rules) => { await finance.saveIncomeRules(rules); setIncomeRulesOpen(false); flash("Salário, VA e calendário atualizados"); }} />}
    {recurringOpen && <RecurringModal rules={recurringRules} categories={categories} accounts={accounts.filter((item) => item.kind !== "credit-card")} cards={cards} onClose={() => setRecurringOpen(false)} onSave={async (rule) => { await finance.saveRecurringRule(rule); setRecurringOpen(false); flash("Recorrência salva e projetada nos próximos meses"); }} />}
    {categoryOpen && <CategoryModal categories={categories} onClose={() => setCategoryOpen(false)} onSave={async (category) => { await finance.saveCategory(category); flash("Categoria salva"); }} />}
    {accountOpen && <AccountModal account={editingAccount} onClose={() => { setAccountOpen(false); setEditingAccount(null); }} onSave={async (account) => { await finance.saveAccount(account); setAccountOpen(false); setEditingAccount(null); flash("Conta salva"); }} onDelete={editingAccount && !editingAccount.fixed ? async () => { if (!window.confirm(`Excluir a conta ${editingAccount.name}?`)) return; await finance.removeAccount(editingAccount.id); setAccountOpen(false); setEditingAccount(null); flash("Conta excluída"); } : undefined} />}
    {cardOpen && <CardModal card={editingCard} accounts={accounts} onClose={() => { setCardOpen(false); setEditingCard(null); }} onSave={async (card) => { await finance.saveCard(card); setCardOpen(false); setEditingCard(null); flash("Cartão e recompensas atualizados"); }} />}
    {tripOpen && <TripModal trip={editingTrip} onClose={() => { setTripOpen(false); setEditingTrip(null); }} onSave={async (trip) => { await finance.saveTrip(trip); setTripOpen(false); setEditingTrip(null); flash("Viagem salva e disponível nos lançamentos"); }} onDelete={editingTrip ? async () => { if (!window.confirm(`Excluir a viagem ${editingTrip.name}?`)) return; await finance.removeTrip(editingTrip.id); setTripOpen(false); setEditingTrip(null); flash("Viagem excluída"); } : undefined} />}
    {notificationsOpen && <NotificationsModal notifications={notifications} unreadCount={unreadCount} busy={notificationsBusy} onClose={() => setNotificationsOpen(false)} onRead={async (item) => { if (!item.readAt) await notificationAction("mark-read", item.id); if (item.feedbackId) { setNotificationsOpen(false); navigate("Configurações"); } }} onReadAll={() => void notificationAction("mark-all-read")} />}
    {notice && <div className="toast"><Check size={17} />{notice}</div>}
  </div>;
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: SessionUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (mode === "register" && password !== String(data.get("confirmPassword") ?? "")) { setBusy(false); setError("As senhas não coincidem."); return; }
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: mode, email: String(data.get("email") ?? ""), displayName: String(data.get("displayName") ?? ""), password }),
      });
      const payload = await response.json() as { user?: SessionUser; error?: string };
      if (!response.ok || !payload.user) throw new Error(payload.error || "Não foi possível entrar");
      onAuthenticated(payload.user);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível entrar"); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><section className="auth-card"><div className="auth-brand"><span className="brand-mark"><TrendingUp size={22} /></span><strong>Fluxo</strong></div><div className="auth-heading"><span className="eyebrow">SEU ASSISTENTE FINANCEIRO</span><h1>{mode === "login" ? "Entre na sua conta" : "Crie seu espaço no Fluxo"}</h1><p>{mode === "login" ? "Seus dados ficam separados de todas as outras contas." : "Cada pessoa recebe um ambiente financeiro independente e privado."}</p></div><form onSubmit={submit}>{mode === "register" && <label>Seu nome<input name="displayName" autoComplete="name" placeholder="Como devemos chamar você?" required /></label>}<label>E-mail<input name="email" type="email" autoComplete="email" placeholder="voce@email.com" required /></label><label>Senha<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} placeholder="Mínimo de 10 caracteres" required /></label>{mode === "register" && <label>Confirmar senha<input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} required /></label>}{error && <div className="auth-error"><AlertTriangle size={16} />{error}</div>}<button className="primary-button auth-submit" type="submit" disabled={busy}>{mode === "login" ? <LockKeyhole size={18} /> : <UserPlus size={18} />}{busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}</button></form><button className="auth-switch" type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? "Ainda não tem conta? Criar agora" : "Já possui uma conta? Entrar"}</button><div className="auth-security"><LockKeyhole size={15} /><span>Sessão protegida e dados isolados por usuário.</span></div></section><aside className="auth-value"><span className="eyebrow">VISÃO CLARA, DECISÕES MELHORES</span><h2>Seu dinheiro explicado em poucos segundos.</h2><div><span><Check size={17} /> Faturas, parcelas e limites integrados</span><span><Check size={17} /> Planejamento e histórico financeiro</span><span><Check size={17} /> Web para administrar, Android para o dia a dia</span></div></aside></main>;
}

function Sidebar({ view, open, user, onLogout, onNavigate, onClose }: { view: View; open: boolean; user: SessionUser & { avatarData?: string | null }; onLogout: () => Promise<void>; onNavigate: (view: View) => void; onClose: () => void }) {
  const avatar = (user.displayName || user.email).slice(0, 1).toUpperCase();
  const firstName = user.displayName.trim().split(/\s+/)[0] || user.email.split("@")[0];
  return <><button className={`sidebar-backdrop ${open ? "show" : ""}`} onClick={onClose} aria-label="Fechar menu" /><aside className={`sidebar ${open ? "open" : ""}`}><div className="brand"><span className="brand-mark"><TrendingUp size={20} /></span><span>Fluxo</span></div><nav className="sidebar-nav">{navItems.map(({ label, icon: Icon }) => <button key={label} className={view === label ? "active" : ""} onClick={() => onNavigate(label)}><Icon size={20} /><span>{label}</span>{view === label && <span className="active-dot" />}</button>)}</nav><div className="sidebar-footer"><button className="sidebar-profile" onClick={() => onNavigate("Configurações")} aria-label="Abrir configurações do perfil">{user.avatarData ? <NextImage className="profile-avatar image" src={user.avatarData} alt="" width={38} height={38} unoptimized /> : <span className="profile-avatar">{avatar}</span>}<strong>{firstName}</strong></button><button className="sidebar-logout" onClick={() => void onLogout()} aria-label="Sair e trocar de conta"><LogOut size={17} /></button></div></aside></>;
}

function SyncPill({ status, onRetry }: { status: SyncStatus; onRetry: () => void }) {
  const config = { connecting: ["Conectando", RefreshCw], synced: ["Sincronizado", Cloud], saving: ["Salvando", RefreshCw], offline: ["Offline", CloudOff], error: ["Tentar novamente", CloudOff] } as const;
  const [label, Icon] = config[status];
  return <button className={`sync-pill ${status}`} onClick={status === "error" || status === "offline" ? onRetry : undefined}><Icon size={15} /><span>{label}</span></button>;
}

function DashboardWidgetCard({ metric, layout, dragging, onOpen, onPointerDown, onPointerMove, onPointerEnd, onKeyboardMove }: {
  metric: DashboardMetric; layout: DashboardWidgetLayout; dragging: boolean; onOpen: (view: View) => void;
  onPointerDown: (id: DashboardWidgetId, layout: DashboardWidgetLayout, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void; onPointerEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyboardMove: (id: DashboardWidgetId, direction: -1 | 1) => void;
}) {
  const Icon = metric.icon;
  const mobile = layout === "mobile";
  return <article className={`${mobile ? "mobile-focus-card" : "metric-card"} widget-${metric.id} ${dragging ? "dragging" : ""}`} data-widget-id={metric.id} data-widget-layout={layout}>
    <button type="button" className={`${mobile ? "mobile-focus-icon" : `metric-icon ${metric.tone}`} widget-drag-handle`} aria-label={`Reorganizar ${metric.label}. Segure e arraste ou use as setas.`} aria-pressed={dragging} onPointerDown={(event) => onPointerDown(metric.id, layout, event)} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); onKeyboardMove(metric.id, -1); } if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); onKeyboardMove(metric.id, 1); } }}>
      <Icon size={mobile ? 25 : 24} /><GripVertical className="widget-grip" size={13} />
    </button>
    <button type="button" className="widget-open" onClick={() => onOpen(metric.target)} aria-label={`Abrir ${metric.label}`}>
      <span className="metric-copy"><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></span>
      {mobile ? <ChevronRight className="widget-open-arrow" size={20} /> : <ArrowUpRight className="metric-arrow" size={17} />}
    </button>
  </article>;
}

function Dashboard(props: {
  transactions: FinanceTransaction[]; monthTransactions: FinanceTransaction[]; selectedMonth: MonthOption;
  totals: ReturnType<typeof totalsFor>; accounts: FinanceAccount[]; categories: FinanceCategory[]; cards: FinanceCard[]; salaryRule: FinanceSalaryRule | null;
  benefitRule: FinanceBenefitRule | null; salaryConfirmed: boolean; balanceTotal: number; cardInvoice: number; nextCommitted: number;
  onNavigate: (view: View) => void; onConfirmIncome: () => void; onConfigureIncome: () => void; onOpenReserve: () => void;
}) {
  const { transactions, monthTransactions, selectedMonth, totals, accounts, categories, cards, salaryRule, benefitRule, salaryConfirmed, balanceTotal, cardInvoice, nextCommitted, onNavigate, onConfirmIncome, onConfigureIncome, onOpenReserve } = props;
  const [widgetOrder, setWidgetOrder] = useState<DashboardWidgetId[]>([...DEFAULT_DASHBOARD_WIDGET_ORDER]);
  const [widgetPreferencesReady, setWidgetPreferencesReady] = useState(false);
  const [draggingWidget, setDraggingWidget] = useState<DashboardWidgetId | null>(null);
  const [widgetAnnouncement, setWidgetAnnouncement] = useState("");
  const longPressTimer = useRef<number | null>(null);
  const dragWidgetRef = useRef<DashboardWidgetId | null>(null);
  const dragLayoutRef = useRef<DashboardWidgetLayout | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const metrics: DashboardMetric[] = [
    { id: "free", label: "Livre para gastar", value: brl.format(totals.free), note: "Entradas menos saídas do mês", icon: PiggyBank, tone: totals.free >= 0 ? "positive" : "warning", target: "Planejamento" },
    { id: "balance", label: "Saldo total", value: brl.format(balanceTotal), note: `${accounts.filter((item) => item.kind !== "credit-card").length} contas e saldos`, icon: WalletCards, tone: "brand", target: "Contas" },
    { id: "invoice", label: "Fatura dos cartões", value: brl.format(cardInvoice), note: `${brl.format(nextCommitted)} já previstos no próximo mês`, icon: CreditCard, tone: "brand", target: "Cartões" },
    { id: "next", label: "Próximo mês", value: brl.format(nextCommitted), note: "Parcelas e recorrências já comprometidas", icon: CalendarDays, tone: "warning", target: "Planejamento" },
  ];
  const orderedMetrics = widgetOrder.map((id) => metrics.find((metric) => metric.id === id)).filter((metric): metric is DashboardMetric => Boolean(metric));

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = window.localStorage.getItem("fluxo-dashboard-widget-order");
        setWidgetOrder(normalizeDashboardWidgetOrder(stored ? JSON.parse(stored) : null));
      } catch { setWidgetOrder([...DEFAULT_DASHBOARD_WIDGET_ORDER]); }
      setWidgetPreferencesReady(true);
    });
    return () => { window.cancelAnimationFrame(frame); if (longPressTimer.current != null) window.clearTimeout(longPressTimer.current); };
  }, []);
  useEffect(() => {
    if (widgetPreferencesReady) window.localStorage.setItem("fluxo-dashboard-widget-order", JSON.stringify(widgetOrder));
  }, [widgetOrder, widgetPreferencesReady]);

  function clearWidgetPress() {
    if (longPressTimer.current != null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }
  function startWidgetPress(id: DashboardWidgetId, layout: DashboardWidgetLayout, event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    clearWidgetPress();
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    dragLayoutRef.current = layout;
    event.currentTarget.setPointerCapture(event.pointerId);
    longPressTimer.current = window.setTimeout(() => {
      dragWidgetRef.current = id;
      setDraggingWidget(id);
      setWidgetAnnouncement(`${metrics.find((metric) => metric.id === id)?.label ?? "Widget"} pronto para mover.`);
      navigator.vibrate?.(24);
    }, 380);
  }
  function moveWidgetPress(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = pointerStartRef.current;
    if (!dragWidgetRef.current) {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 9) clearWidgetPress();
      return;
    }
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-widget-id]") as HTMLElement | null;
    const targetId = target?.dataset.widgetId as DashboardWidgetId | undefined;
    if (!targetId || target.dataset.widgetLayout !== dragLayoutRef.current || targetId === dragWidgetRef.current) return;
    const activeId = dragWidgetRef.current;
    setWidgetOrder((current) => reorderDashboardWidgets(current, activeId, targetId));
    setWidgetAnnouncement(`${metrics.find((metric) => metric.id === activeId)?.label ?? "Widget"} reposicionado.`);
  }
  function finishWidgetPress(event: ReactPointerEvent<HTMLButtonElement>) {
    clearWidgetPress();
    pointerStartRef.current = null;
    dragWidgetRef.current = null;
    dragLayoutRef.current = null;
    setDraggingWidget(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function moveWidgetByKeyboard(id: DashboardWidgetId, direction: -1 | 1) {
    const index = widgetOrder.indexOf(id);
    const target = widgetOrder[index + direction];
    if (!target) return;
    setWidgetOrder((current) => reorderDashboardWidgets(current, id, target));
    setWidgetAnnouncement(`${metrics.find((metric) => metric.id === id)?.label ?? "Widget"} reposicionado.`);
  }
  function resetWidgetOrder() {
    setWidgetOrder([...DEFAULT_DASHBOARD_WIDGET_ORDER]);
    setWidgetAnnouncement("Ordem original dos widgets restaurada.");
  }
  const categoryTotals = new Map<string, number>();
  monthTransactions.filter((item) => item.type === "expense").forEach((item) => categoryTotals.set(item.category, (categoryTotals.get(item.category) ?? 0) + item.amount));
  const categoryRows = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const future = transactions.filter((item) => item.type === "expense" && financialMonthOf(item) > selectedMonth.key).sort((a, b) => financialMonthOf(a).localeCompare(financialMonthOf(b))).slice(0, 3);
  const reserveAccount = accounts.find((item) => item.fixed && item.name === "Reserva de emergência") ?? accounts.find((item) => item.kind === "investment");
  const reserve = reserveAccount ? accountBalanceAtMonth(reserveAccount, transactions, selectedMonth.key) : 0;
  const essentialNames = new Set(categories.filter((item) => item.kind === "expense" && item.essential).map((item) => item.name));
  const essentialByMonth = new Map<string, number>(); transactions.filter((item) => item.type === "expense" && item.status !== "planned" && essentialNames.has(item.category)).forEach((item) => { const key = calendarMonthOf(item); essentialByMonth.set(key, (essentialByMonth.get(key) ?? 0) + item.amount); });
  const recentEssential = [...essentialByMonth.entries()].filter(([key]) => key <= selectedMonth.key).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6); const essentialAverage = recentEssential.length ? recentEssential.reduce((sum, [, value]) => sum + value, 0) / recentEssential.length : 0; const reserveRecommendation = essentialAverage * 6; const reserveTarget = reserveAccount?.goal || reserveRecommendation;
  const benefitAmount = benefitRule ? benefitRule.amount * businessDaysInMonth(selectedMonth.key) : 0;
  const dashboardTip = contextualFinancialTip(transactions, selectedMonth.key, cards);
  const salaryDate = salaryRule ? effectiveRecurringDate(selectedMonth.key, salaryRule.dayOfMonth, salaryRule.scheduleMode, salaryRule.dateAdjustment) : "";
  return <div className="dashboard page-enter">
    {salaryRule && !salaryConfirmed && <section className="salary-banner"><div className="salary-icon"><Banknote size={20} /></div><div><strong>Salário e VA previstos para {dateLabel(salaryDate)}</strong><span>{brl.format(salaryRule.amount)} no {salaryRule.account}{benefitRule ? ` + ${brl.format(benefitAmount)} no Caju (${businessDaysInMonth(selectedMonth.key)} dias úteis)` : ""}</span></div><button onClick={onConfirmIncome}>Confirmar recebimento</button></section>}
    {!salaryRule && <section className="salary-banner setup"><div className="salary-icon"><Banknote size={20} /></div><div><strong>Configure salário e VA</strong><span>O calendário calcula dias úteis e mantém tudo previsto até sua confirmação.</span></div><button onClick={onConfigureIncome}>Configurar</button></section>}
    <span className="widget-reorder-live" aria-live="polite">{widgetAnnouncement}</span>
    <section className="mobile-dashboard-focus" aria-label="Resumo financeiro personalizável do mês">
      <div className="mobile-focus-heading"><span><strong>Seu mês em foco</strong><small>Segure o ícone e arraste para mover</small></span><div><em>{selectedMonth.label}</em><button type="button" className="widget-reset" onClick={resetWidgetOrder} aria-label="Restaurar ordem original dos widgets"><RotateCcw size={15} /></button></div></div>
      <div className="mobile-focus-cards">
        {orderedMetrics.map((metric) => <DashboardWidgetCard key={`mobile-${metric.id}`} metric={metric} layout="mobile" dragging={draggingWidget === metric.id} onOpen={onNavigate} onPointerDown={startWidgetPress} onPointerMove={moveWidgetPress} onPointerEnd={finishWidgetPress} onKeyboardMove={moveWidgetByKeyboard} />)}
      </div>
      <button className="mobile-finance-insight" onClick={() => onNavigate("Planejamento")}><Sparkles size={17} /><span><strong>Dica do Fluxo</strong><small>{dashboardTip}</small></span><ChevronRight size={17} /></button>
    </section>
    <FlowAssistant period={selectedMonth.key} tip={dashboardTip} />
    <section className="desktop-dashboard-widgets" aria-label="Widgets financeiros personalizáveis">
      <div className="dashboard-widget-toolbar"><div><strong>Seu painel</strong><small>Segure o ícone e arraste para reorganizar</small></div><button type="button" className="widget-reset" onClick={resetWidgetOrder}><RotateCcw size={15} /> Restaurar ordem</button></div>
      <div className="metric-grid">{orderedMetrics.map((metric) => <DashboardWidgetCard key={`desktop-${metric.id}`} metric={metric} layout="desktop" dragging={draggingWidget === metric.id} onOpen={onNavigate} onPointerDown={startWidgetPress} onPointerMove={moveWidgetPress} onPointerEnd={finishWidgetPress} onKeyboardMove={moveWidgetByKeyboard} />)}</div>
    </section>
    <section className="dashboard-grid">
      <article className="panel cashflow-panel"><PanelHeader title="Fluxo do mês" action="Ver relatório" onAction={() => onNavigate("Relatórios")} /><div className="chart-summary"><span><i className="dot income" />Entradas <strong>{brl.format(totals.income)}</strong></span><span><i className="dot expense" />Saídas <strong>{brl.format(totals.expenses)}</strong></span><div><small>Saldo do mês</small><strong>{brl.format(totals.free)}</strong></div></div><CashflowChart income={totals.income} expenses={totals.expenses} /><div className="insight-row"><Sparkles size={17} /><span>{monthTransactions.length ? "Seus dados já estão prontos para análise por categoria e período." : "Adicione seus primeiros lançamentos para iniciar a análise."}</span><ChevronRight size={17} /></div></article>
      <article className="panel budget-panel"><PanelHeader title="Gastos por categoria" action="Detalhar" onAction={() => onNavigate("Relatórios")} />{categoryRows.length ? <div className="budget-list">{categoryRows.map(([label, spent]) => { const percent = totals.expenses ? Math.round(spent / totals.expenses * 100) : 0; return <button className="budget-row" key={label} onClick={() => onNavigate("Relatórios")}><span className="category-icon"><CircleDollarSign size={18} /></span><span className="budget-data"><span><strong>{label}</strong><small>{brl.format(spent)}</small></span><span className="progress"><i style={{ width: `${percent}%` }} /></span></span><strong className="accent-text">{percent}%</strong></button>; })}</div> : <EmptyState icon={CircleDollarSign} title="Nenhum gasto neste mês" text="As categorias aparecem conforme você lança despesas." />}</article>
      <article className="panel commitments-panel"><PanelHeader title="Próximos compromissos" action="Ver todos" onAction={() => onNavigate("Planejamento")} />{future.length ? <div className="commitment-list">{future.map((item) => <button className="commitment-row" key={item.id} onClick={() => onNavigate("Planejamento")}><span className="date-badge"><strong>{item.date.slice(8, 10)}</strong><small>{shortDate(item.date).slice(3)}</small></span><span className="commitment-week">{item.installments ?? ""}</span><span>{item.description}</span><strong>{brl.format(item.amount)}</strong><ChevronRight size={16} /></button>)}</div> : <EmptyState icon={CalendarDays} title="Nada previsto" text="Parcelas e despesas futuras aparecerão aqui." />}</article>
      <button className="reserve-card" onClick={onOpenReserve}><div className="reserve-top"><span className="reserve-alert"><Coins size={21} /></span><div><span>Reserva de emergência</span><h2>{reserve ? "Cobertura dos gastos essenciais" : "Definir meta da reserva"}</h2></div><ChevronRight size={19} /></div><p>{reserveRecommendation ? `Recomendação automática: 6 meses da sua média essencial (${brl.format(essentialAverage)}/mês).` : "Marque categorias essenciais para o app calcular sua cobertura recomendada."}</p><div className="reserve-progress"><span><strong>{brl.format(reserve)}</strong><small>{reserveTarget ? ` de ${brl.format(reserveTarget)}` : "meta ainda não definida"}</small></span><strong>{reserveTarget ? `${Math.min(100, Math.round(reserve / reserveTarget * 100))}%` : "Configurar"}</strong></div><div className="progress warning"><i style={{ width: `${reserveTarget ? Math.min(100, reserve / reserveTarget * 100) : 0}%` }} /></div></button>
    </section>
  </div>;
}

function FlowAssistant({ period, tip }: { period: string; tip: string }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<FinancialCoachResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const suggestions = ["Quanto posso gastar sem apertar o próximo mês?", "Minha reserva de emergência está saudável?", "Qual gasto merece mais atenção agora?"];
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.body.style.overflow = "hidden"; document.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", close); };
  }, [open]);
  async function ask(value = question) {
    const prompt = value.trim();
    if (prompt.length < 3 || busy) return;
    setQuestion(prompt); setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/ai/advice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: prompt, period }) });
      const payload = await response.json() as { advice?: FinancialCoachResult; error?: string };
      if (!response.ok || !payload.advice) throw new Error(payload.error || "Não consegui analisar seus dados");
      setResult(payload.advice);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não consegui analisar seus dados"); }
    finally { setBusy(false); }
  }
  return <><section className="flow-ai-card">
    <div className="flow-ai-orb"><Sparkles size={22} /></div><div className="flow-ai-copy"><span>ASSISTENTE FLUXO</span><strong>Uma decisão melhor começa pelos seus dados.</strong><small>{result?.summary || tip}</small></div><button className="primary-button" onClick={() => setOpen(true)}>Perguntar à IA</button>
  </section>
    {open && createPortal(<div className="modal-layer global-modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}><section className="modal flow-ai-modal" role="dialog" aria-modal="true" aria-labelledby="flow-ai-title"><div className="modal-header"><div><span className="eyebrow">GESTOR FINANCEIRO</span><h2 id="flow-ai-title">Converse com o Fluxo</h2><p>As respostas consideram somente os dados da sua conta e do período selecionado.</p></div><button className="icon-button" aria-label="Fechar assistente" onClick={() => setOpen(false)}><X size={19} /></button></div>
      <div className="ai-suggestions">{suggestions.map((item) => <button key={item} onClick={() => void ask(item)}>{item}</button>)}</div>
      {result && <div className="ai-answer"><span><Sparkles size={17} /> ANÁLISE DO FLUXO</span><strong>{result.summary}</strong><p>{result.answer}</p>{result.actions.length > 0 && <div className="ai-actions">{result.actions.map((action) => <article key={`${action.label}-${action.reason}`} data-priority={action.priority}><span>{action.priority === "high" ? "Prioridade" : "Próximo passo"}</span><strong>{action.label}</strong><small>{action.reason}</small></article>)}</div>}{result.warnings.map((warning) => <small className="ai-warning" key={warning}><AlertTriangle size={14} />{warning}</small>)}</div>}
      {error && <div className="auth-error"><AlertTriangle size={16} />{error}</div>}
      <form className="ai-question" onSubmit={(event) => { event.preventDefault(); void ask(); }}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ex.: Posso fazer uma compra de R$ 800 agora?" maxLength={600} /><button className="primary-button" disabled={busy || question.trim().length < 3}>{busy ? <RefreshCw className="spin" size={17} /> : <Send size={17} />}{busy ? "Analisando" : "Perguntar"}</button></form>
    </section></div>, document.body)}
  </>;
}

function NotificationsModal({ notifications, unreadCount, busy, onClose, onRead, onReadAll }: { notifications: AppNotification[]; unreadCount: number; busy: boolean; onClose: () => void; onRead: (item: AppNotification) => Promise<void>; onReadAll: () => void }) {
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [onClose]);
  return createPortal(<div className="modal-layer global-modal-layer notifications-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal notifications-modal" role="dialog" aria-modal="true" aria-labelledby="notifications-title"><div className="modal-header"><div><span className="eyebrow">CENTRAL DE ALERTAS</span><h2 id="notifications-title">Notificações</h2><p>{unreadCount ? `${unreadCount} ${unreadCount === 1 ? "novidade ainda não lida" : "novidades ainda não lidas"}.` : "Você está em dia com as novidades."}</p></div><button className="icon-button" aria-label="Fechar notificações" onClick={onClose}><X size={19} /></button></div>
    <div className="notifications-toolbar"><span>Atualizações do Fluxo</span>{unreadCount > 0 && <button disabled={busy} onClick={onReadAll}><Check size={14} /> Marcar todas como lidas</button>}</div>
    <div className="notifications-list">{notifications.length ? notifications.map((item) => <button key={item.id} className={item.readAt ? "notification-item" : "notification-item unread"} onClick={() => void onRead(item)}><span className="notification-kind">{item.kind === "feedback-new" ? <MessageSquare size={17} /> : <Bell size={17} />}</span><span><strong>{item.title}</strong><small>{item.message}</small><time>{new Date(item.createdAt).toLocaleString("pt-BR")}</time></span>{!item.readAt && <i aria-label="Não lida" />}</button>) : <EmptyState icon={Bell} title="Nenhuma notificação" text="Recomendações e mudanças de status aparecerão aqui." />}</div>
  </section></div>, document.body);
}

async function avatarDataFromFile(file: File) {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) throw new Error("Escolha uma imagem JPG, PNG ou WebP");
  const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Não consegui abrir a imagem")); reader.readAsDataURL(file); });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error("Imagem inválida")); element.src = source; });
  const canvas = document.createElement("canvas"); const size = 320; canvas.width = size; canvas.height = size;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Não consegui preparar a imagem");
  const crop = Math.min(image.naturalWidth, image.naturalHeight); const x = (image.naturalWidth - crop) / 2; const y = (image.naturalHeight - crop) / 2;
  context.drawImage(image, x, y, crop, crop, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", .78);
}

async function cardDataFromFile(file: File) {
  if (!file.type.match(/^image\/(jpeg|png|webp)$/)) throw new Error("Escolha uma imagem JPG, PNG ou WebP");
  const source = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Não consegui abrir a imagem")); reader.readAsDataURL(file); });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const element = new Image(); element.onload = () => resolve(element); element.onerror = () => reject(new Error("Imagem inválida")); element.src = source; });
  const canvas = document.createElement("canvas"); canvas.width = 1269; canvas.height = 800;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Não consegui preparar a imagem");
  context.fillStyle = "#0b1118"; context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight); const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  return canvas.toDataURL("image/jpeg", .82);
}

function SettingsView({ user, finance, onUser, onLogout, onFlash }: {
  user: SessionUser & { avatarData?: string | null };
  finance: { transactions: FinanceTransaction[]; accounts: FinanceAccount[]; categories: FinanceCategory[]; cards: FinanceCard[]; trips: FinanceTrip[]; rewardRedemptions: FinanceRewardRedemption[]; salaryRule: FinanceSalaryRule | null; benefitRule: FinanceBenefitRule | null; recurringRules: FinanceRecurringRule[] };
  onUser: (user: SessionUser & { avatarData?: string | null }) => void; onLogout: () => Promise<void>; onFlash: (message: string) => void;
}) {
  const [profile, setProfile] = useState<ProfilePayload | null>(null); const [busy, setBusy] = useState(false); const [feedbackText, setFeedbackText] = useState(""); const [feedbackComments, setFeedbackComments] = useState<Record<string, string>>({}); const [error, setError] = useState("");
  useEffect(() => { let active = true; fetch("/api/v1/profile", { cache: "no-store" }).then(async (response) => { const payload = await response.json() as ProfilePayload & { error?: string }; if (!response.ok) throw new Error(payload.error || "Não consegui carregar o perfil"); if (active) { setProfile(payload); setFeedbackComments(Object.fromEntries(payload.feedback.map((item) => [item.id, item.developerComment ?? ""]))); onUser(payload.user); } }).catch((reason) => active && setError(reason instanceof Error ? reason.message : "Não consegui carregar o perfil")); return () => { active = false; }; }, [onUser]);
  async function action(payload: Record<string, unknown>) {
    setBusy(true); setError("");
    try { const response = await fetch("/api/v1/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json() as ProfilePayload & { error?: string; requiresLogin?: boolean }; if (!response.ok) throw new Error(result.error || "Não foi possível salvar"); if (result.requiresLogin) { onFlash("Senha alterada. Entre novamente para proteger a conta."); await onLogout(); return null; } setProfile(result); setFeedbackComments(Object.fromEntries(result.feedback.map((item) => [item.id, item.developerComment ?? ""]))); onUser(result.user); return result; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar"); return null; }
    finally { setBusy(false); }
  }
  async function saveName(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const result = await action({ action: "profile", displayName: String(data.get("displayName") || "") }); if (result) onFlash("Nome atualizado"); }
  async function savePassword(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const next = String(data.get("nextPassword") || ""); if (next !== String(data.get("confirmPassword") || "")) { setError("As novas senhas não coincidem"); return; } await action({ action: "password", currentPassword: String(data.get("currentPassword") || ""), nextPassword: next }); }
  async function sendFeedback(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const result = await action({ action: "feedback", message: feedbackText }); if (result) { setFeedbackText(""); onFlash("Recomendação enviada ao desenvolvedor"); } }
  function exportData() { const data = { app: "Fluxo", exportedAt: new Date().toISOString(), user: { id: user.id, email: user.email, displayName: profile?.user.displayName ?? user.displayName }, ...finance }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `fluxo-export-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); }
  const shownUser = profile?.user ?? user; const avatar = (shownUser.displayName || shownUser.email).slice(0, 1).toUpperCase();
  const statusLabel: Record<string, string> = { new: "Nova", reviewing: "Em análise", planned: "Planejada", done: "Concluída" };
  return <div className="settings-page page-enter"><section className="settings-hero"><div>{shownUser.avatarData ? <NextImage className="settings-avatar" src={shownUser.avatarData} alt="Foto de perfil" width={86} height={86} unoptimized /> : <span className="settings-avatar fallback">{avatar}</span>}<label className="avatar-edit"><Camera size={15} /> Alterar foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const avatarData = await avatarDataFromFile(file); const result = await action({ action: "profile", avatarData }); if (result) onFlash("Foto atualizada"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Imagem inválida"); } }} /></label></div><span><small>SEU PERFIL</small><h2>{shownUser.displayName}</h2><p>Preferências, segurança, portabilidade e contato com o desenvolvimento.</p></span></section>
    {error && <div className="auth-error settings-error"><AlertTriangle size={16} />{error}</div>}
    <div className="settings-grid"><section className="panel settings-card"><div className="settings-title"><Settings2 size={19} /><span><strong>Dados pessoais</strong><small>O e-mail continua sendo sua identificação de acesso.</small></span></div><form onSubmit={saveName}><label>Nome de exibição<input name="displayName" defaultValue={shownUser.displayName} required minLength={2} maxLength={80} /></label><label>E-mail<input value={shownUser.email} disabled /></label><button className="primary-button" disabled={busy}>Salvar perfil</button></form></section>
      <section className="panel settings-card"><div className="settings-title"><KeyRound size={19} /><span><strong>Alterar senha</strong><small>Todos os aparelhos serão desconectados após a troca.</small></span></div><form onSubmit={savePassword}><label>Senha atual<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label>Nova senha<input name="nextPassword" type="password" minLength={10} autoComplete="new-password" required /></label><label>Confirmar nova senha<input name="confirmPassword" type="password" minLength={10} autoComplete="new-password" required /></label><button className="secondary-button" disabled={busy}>Atualizar senha</button></form></section>
      <section className="panel settings-card export-card"><div className="settings-title"><FileJson size={19} /><span><strong>Seus dados</strong><small>Baixe uma cópia legível de contas, cartões, regras e lançamentos.</small></span></div><button className="secondary-button" onClick={exportData}><Download size={16} /> Exportar JSON</button><button className="ghost-button danger" onClick={() => void onLogout()}><LogOut size={16} /> Sair desta conta</button></section>
      <section className="panel settings-card feedback-card"><div className="settings-title"><MessageSquare size={19} /><span><strong>Recomendar melhoria</strong><small>Sua ideia chegará diretamente à caixa do desenvolvedor.</small></span></div><form onSubmit={sendFeedback}><textarea value={feedbackText} onChange={(event) => setFeedbackText(event.target.value)} maxLength={2000} placeholder="O que deixaria o Fluxo melhor para você?" /><button className="primary-button" disabled={busy || feedbackText.trim().length < 5}><Send size={16} /> Enviar recomendação</button></form>{!profile?.isDeveloper && profile?.feedback?.length ? <div className="own-feedback"><strong>Suas recomendações</strong>{profile.feedback.slice(0, 6).map((item) => <article key={item.id}><div><small>{statusLabel[item.status] || item.status}</small><time>{new Date(item.updatedAt || item.createdAt).toLocaleDateString("pt-BR")}</time></div><p>{item.message}</p>{item.developerComment && <blockquote><MessageSquare size={13} /><span><strong>Retorno do desenvolvimento</strong>{item.developerComment}</span></blockquote>}</article>)}</div> : null}</section>
    </div>
    {profile?.isDeveloper && <section className="panel developer-inbox"><div className="settings-title"><Bell size={19} /><span><strong>Caixa do desenvolvedor</strong><small>{profile.feedback.filter((item) => item.status === "new").length} novas recomendações · visível somente para a conta principal.</small></span></div><div>{profile.feedback.length ? profile.feedback.map((item) => <article key={item.id}><header><span><strong>{item.senderName}</strong><small>{new Date(item.createdAt).toLocaleString("pt-BR")}</small></span><em>{statusLabel[item.status] || item.status}</em></header><p>{item.message}</p><textarea value={feedbackComments[item.id] ?? ""} onChange={(event) => setFeedbackComments((current) => ({ ...current, [item.id]: event.target.value }))} maxLength={2000} placeholder="Adicione um retorno, detalhes da implementação ou orientação para o usuário…" /><footer><div>{(["new", "reviewing", "planned", "done"] as const).map((status) => <button key={status} className={item.status === status ? "active" : ""} disabled={busy} onClick={() => void action({ action: "feedback-status", feedbackId: item.id, status, developerComment: feedbackComments[item.id] ?? "" }).then((result) => result && onFlash(`Recomendação marcada como ${statusLabel[status].toLowerCase()}`))}>{statusLabel[status]}</button>)}</div><button className="secondary-button" disabled={busy} onClick={() => void action({ action: "feedback-status", feedbackId: item.id, status: item.status, developerComment: feedbackComments[item.id] ?? "" }).then((result) => result && onFlash("Comentário salvo e usuário notificado"))}><Send size={14} /> Salvar comentário</button></footer></article>) : <EmptyState icon={MessageSquare} title="Nenhuma recomendação" text="As sugestões de outros usuários aparecerão aqui." />}</div></section>}
  </div>;
}

function PanelHeader({ title, action, onAction }: { title: string; action: string; onAction: () => void }) { return <div className="panel-header"><h2>{title}</h2><button onClick={onAction}>{action}<ChevronRight size={16} /></button></div>; }
function EmptyState({ icon: Icon, title, text }: { icon: typeof CircleDollarSign; title: string; text: string }) { return <div className="empty-state"><span><Icon size={20} /></span><strong>{title}</strong><small>{text}</small></div>; }
function CashflowChart({ income, expenses }: { income: number; expenses: number }) { const max = Math.max(income, expenses, 1); return <div className="cashflow-bars"><div><span>Entradas</span><i><b style={{ width: `${income / max * 100}%` }} /></i><strong>{brl.format(income)}</strong></div><div className="expense"><span>Saídas</span><i><b style={{ width: `${expenses / max * 100}%` }} /></i><strong>{brl.format(expenses)}</strong></div></div>; }

function ProductView(props: {
  view: View; transactions: FinanceTransaction[]; monthTransactions: FinanceTransaction[]; accounts: FinanceAccount[]; categories: FinanceCategory[]; cards: FinanceCard[]; trips: FinanceTrip[]; rewardRedemptions: FinanceRewardRedemption[]; recurringRules: FinanceRecurringRule[];
  salaryRule: FinanceSalaryRule | null; benefitRule: FinanceBenefitRule | null; exchangeRate: FinanceExchangeRate | null;
  selectedMonth: MonthOption; totals: ReturnType<typeof totalsFor>; onNew: () => void; onImport: () => void; onConfigureIncome: () => void;
  onCategories: () => void; onRecurring: () => void; onEditTransaction: (item: FinanceTransaction) => void; onEditAccount: (account: FinanceAccount | null) => void; onEditCard: (card: FinanceCard | null) => void; onEditTrip: (trip: FinanceTrip | null) => void; onSelectMonth: (month: string) => void; onPayInvoice: (payment: { cardId: string; invoiceMonth: string; sourceAccount: string; amount: number; date?: string }) => Promise<void>; onRedeemReward: (redemption: Omit<FinanceRewardRedemption, "id" | "createdAt">) => Promise<void>;
}) {
  if (props.view === "Lançamentos") return <TransactionsView {...props} transactions={props.monthTransactions} />;
  if (props.view === "Contas") return <AccountsView accounts={props.accounts} transactions={props.transactions} categories={props.categories} selectedMonth={props.selectedMonth} onNew={props.onNew} onEdit={props.onEditAccount} onEditTransaction={props.onEditTransaction} />;
  if (props.view === "Cartões") return <CardsView {...props} />;
  if (props.view === "Viagens") return <TripsView trips={props.trips} transactions={props.transactions} categories={props.categories} onEdit={props.onEditTrip} onEditTransaction={props.onEditTransaction} onNewTransaction={props.onNew} />;
  if (props.view === "Planejamento") return <PlanningView transactions={props.transactions} salaryRule={props.salaryRule} benefitRule={props.benefitRule} recurringRules={props.recurringRules} selectedMonth={props.selectedMonth} onRecurring={props.onRecurring} />;
  return <ReportsView transactions={props.transactions} selectedMonth={props.selectedMonth} />;
}

function TripsView({ trips, transactions, categories, onEdit, onEditTransaction, onNewTransaction }: {
  trips: FinanceTrip[]; transactions: FinanceTransaction[]; categories: FinanceCategory[];
  onEdit: (trip: FinanceTrip | null) => void; onEditTransaction: (item: FinanceTransaction) => void; onNewTransaction: () => void;
}) {
  const [selectedId, setSelectedId] = useState(trips[0]?.id ?? "");
  const selected = trips.find((item) => item.id === selectedId) ?? trips[0];
  const summary = selected ? tripExpenseSummary(transactions, selected.id) : { items: [], total: 0, categories: [] };
  const { items, total, categories: grouped } = summary;
  const categoryColors = new Map(categories.map((item) => [item.name, item.color]));
  const today = localDateKey();
  const status = selected ? today < selected.startDate ? "Planejada" : today > selected.endDate ? "Concluída" : "Em andamento" : "";
  if (!selected) return <div className="product-page page-enter"><section className="travel-empty panel"><span><Plane size={28} /></span><div><p className="eyebrow">MODO VIAGEM</p><h2>Separe os gastos de cada destino</h2><p>Crie uma viagem com período, moeda e cotação. Depois, use a tag da viagem em qualquer lançamento sem mudar o funcionamento da sua conta ou fatura.</p></div><button className="primary-button" onClick={() => onEdit(null)}><Plus size={17} /> Criar primeira viagem</button></section></div>;
  return <div className="product-page travel-page page-enter">
    <section className="travel-toolbar panel"><div><p className="eyebrow">MODO VIAGEM</p><h2>Seus gastos, separados por viagem</h2><p>O lançamento continua na conta, no cartão e no mês correto; a viagem funciona como um filtro adicional.</p></div><button className="primary-button" onClick={() => onEdit(null)}><Plus size={17} /> Nova viagem</button></section>
    <div className="trip-selector" role="tablist" aria-label="Selecionar viagem">{trips.map((trip) => <button role="tab" aria-selected={trip.id === selected.id} className={trip.id === selected.id ? "active" : ""} key={trip.id} onClick={() => setSelectedId(trip.id)}><Plane size={16} /><span><strong>{trip.name}</strong><small>{dateLabel(trip.startDate)} — {dateLabel(trip.endDate)}</small></span></button>)}</div>
    <section className="travel-hero panel"><div className="travel-hero-copy"><span className="travel-status"><i />{status}</span><p>Gasto total na viagem</p><strong>{brl.format(total)}</strong><small>{foreignMoney(tripTotalInCurrency(total, selected.exchangeRate), selected.currency)} na cotação informada</small><div className="travel-period"><MapPin size={16} /><span>{selected.name}</span><CalendarDays size={16} /><span>{dateLabel(selected.startDate)} — {dateLabel(selected.endDate)}</span></div></div><div className="travel-exchange"><span>COTAÇÃO DE REFERÊNCIA</span><strong>1 {selected.currency} = {brl.format(selected.exchangeRate)}</strong><small>A conversão é informativa. Seus saldos continuam registrados em reais.</small><button className="secondary-button" onClick={() => onEdit(selected)}><Pencil size={15} /> Editar viagem</button></div></section>
    <section className="travel-kpis"><article className="panel"><span>Lançamentos</span><strong>{items.length}</strong><small>despesas identificadas</small></article><article className="panel"><span>Categorias usadas</span><strong>{grouped.length}</strong><small>mesmas categorias do Fluxo</small></article><article className="panel"><span>Média por gasto</span><strong>{brl.format(items.length ? total / items.length : 0)}</strong><small>durante a viagem</small></article></section>
    <section className="travel-content"><article className="panel travel-categories"><PanelHeader title="Gastos por categoria" action="Editar viagem" onAction={() => onEdit(selected)} />{grouped.length ? <div>{grouped.map(([name, value]) => <div className="travel-category-row" key={name}><i data-color={categoryColors.get(name) ?? "teal"} /><span><strong>{name}</strong><small>{total ? Math.round(value / total * 100) : 0}% da viagem</small></span><span className="travel-category-bar"><b style={{ width: `${total ? value / total * 100 : 0}%` }} /></span><strong>{brl.format(value)}</strong></div>)}</div> : <EmptyState icon={Tags} title="Nenhum gasto nesta viagem" text="Ao lançar uma despesa, selecione esta viagem no campo de identificação." />}</article><article className="panel travel-transactions"><PanelHeader title="Lançamentos da viagem" action="Novo gasto" onAction={onNewTransaction} /><div>{items.length ? [...items].sort((a, b) => b.date.localeCompare(a.date)).map((item) => <button key={item.id} onClick={() => onEditTransaction(item)}><span className="transaction-icon expense"><ArrowUpRight size={17} /></span><span><strong>{item.description}</strong><small>{item.category} · {shortDate(item.date)}{item.installments ? ` · Parcela ${item.installments}` : ""}</small></span><strong>{brl.format(item.amount)}</strong><ChevronRight size={15} /></button>) : <EmptyState icon={ReceiptText} title="A viagem ainda está zerada" text="Adicione a tag da viagem a um lançamento novo ou existente." />}</div></article></section>
  </div>;
}

function TransactionsView({ transactions, trips, totals, salaryRule, onNew, onImport, onConfigureIncome, onCategories, onEditTransaction }: {
  transactions: FinanceTransaction[]; trips: FinanceTrip[]; totals: ReturnType<typeof totalsFor>; salaryRule: FinanceSalaryRule | null;
  onNew: () => void; onImport: () => void; onConfigureIncome: () => void; onCategories: () => void; onEditTransaction: (item: FinanceTransaction) => void;
}) {
  const [search, setSearch] = useState("");
  const normalized = search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = transactions.filter((item) => `${item.description} ${item.category} ${item.account} ${item.destinationAccount ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalized));
  return <div className="product-page page-enter">
    <section className="summary-strip"><div><span>Entradas no mês</span><strong className="income-text">+ {brl.format(totals.income)}</strong></div><div><span>Saídas no mês</span><strong>− {brl.format(totals.expenses)}</strong></div><div><span>Lançamentos</span><strong>{transactions.length}</strong></div><div><span>Aguardando sincronização</span><strong className="warning-text">{transactions.filter((item) => item.pendingSync).length}</strong></div></section>
    <section className="panel table-panel"><div className="section-toolbar"><div className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar lançamento" placeholder="Buscar por descrição, categoria ou conta" /></div><button className="secondary-button" onClick={onCategories}><Tags size={16} /> Categorias</button><button className="secondary-button" onClick={onImport}><FileUp size={16} /> Importar</button><button className="primary-button" onClick={onNew}><Plus size={16} /> Adicionar</button></div><div className="table-heading"><span>Descrição</span><span>Data</span><span>Conta</span><span>Valor</span></div><div className="transaction-table">{visible.length ? visible.map((item) => {
      const trip = trips.find((candidate) => candidate.id === item.tripId);
      const transfer = item.type === "transfer";
      return <button className="transaction-row full" key={item.id} onClick={() => onEditTransaction(item)}><span className={`transaction-icon ${item.type}`}>{item.type === "income" ? <ArrowDownRight /> : transfer ? <Repeat2 /> : <ArrowUpRight />}</span><span><strong>{item.description}</strong><small>{transfer ? "Transferência" : item.category}{item.installments ? ` · Parcela ${item.installments}` : ""}{trip ? ` · ✈ ${trip.name}` : ""} · {transfer ? "Entre contas" : item.paymentMethod === "credit" ? "Crédito" : item.paymentMethod === "debit" ? "Débito" : item.type === "income" ? "Entrada" : "Saldo"}</small></span><small>{shortDate(item.date)}{item.pendingSync ? " · pendente" : ""}</small><small>{transfer && item.destinationAccount ? `${item.account} → ${item.destinationAccount}` : item.account}</small><strong className={item.type === "income" ? "income-text" : transfer ? "transfer-text" : ""}>{item.type === "income" ? "+ " : transfer ? "" : "− "}{brl.format(item.amount)}</strong><Pencil size={15} /></button>;
    }) : <EmptyState icon={ReceiptText} title="Nenhum lançamento" text={search ? "Nenhum resultado para esta busca." : "Adicione manualmente ou importe um CSV ou OFX."} />}</div></section>
    <section className="automation-card"><span className="automation-icon"><CalendarDays size={20} /></span><div><span>{salaryRule ? "RECORRÊNCIA COM DIAS ÚTEIS" : "AUTOMAÇÃO DISPONÍVEL"}</span><strong>{salaryRule ? `${salaryRule.description} · ${salaryRule.scheduleMode === "business-day-of-month" ? `${salaryRule.dayOfMonth}º dia útil` : `dia ${salaryRule.dayOfMonth} com ajuste`}` : "Configure salário e VA"}</strong><small>O recebimento continua previsto até sua confirmação.</small></div><button className="secondary-button" onClick={onConfigureIncome}>{salaryRule ? "Editar regras" : "Configurar"}</button></section>
  </div>;
}

function AccountsView({ accounts, transactions, categories, selectedMonth, onNew, onEdit, onEditTransaction }: { accounts: FinanceAccount[]; transactions: FinanceTransaction[]; categories: FinanceCategory[]; selectedMonth: MonthOption; onNew: () => void; onEdit: (account: FinanceAccount | null) => void; onEditTransaction: (transaction: FinanceTransaction) => void }) {
  const baseVisible = accounts.filter((item) => item.kind !== "credit-card");
  const visible = baseVisible.map((item) => ({ ...item, balance: accountBalanceAtMonth(item, transactions, selectedMonth.key) }));
  const [selectedId, setSelectedId] = useState(visible[0]?.id ?? ""); const selected = visible.find((item) => item.id === selectedId) ?? visible[0];
  const total = visible.reduce((sum, item) => sum + item.balance, 0);
  const investment = visible.filter((item) => item.kind === "investment").reduce((sum, item) => sum + item.balance, 0);
  const available = total - investment;
  const periodTransactions = transactionsForMonth(transactions, selectedMonth.key);
  const recent = selected ? periodTransactions.filter((item) => item.account === selected.name || item.destinationAccount === selected.name).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8) : []; const monthlyYield = selected ? selected.balance * selected.monthlyYieldPercent / 100 : 0;
  const essentialNames = new Set(categories.filter((item) => item.essential).map((item) => item.name)); const essentialMonths = new Map<string, number>(); transactions.filter((item) => item.type === "expense" && item.status !== "planned" && essentialNames.has(item.category)).forEach((item) => { const key = calendarMonthOf(item); essentialMonths.set(key, (essentialMonths.get(key) ?? 0) + item.amount); }); const essentialValues = [...essentialMonths.entries()].filter(([key]) => key <= selectedMonth.key).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).map(([, value]) => value); const recommendedReserve = essentialValues.length ? essentialValues.reduce((sum, value) => sum + value, 0) / essentialValues.length * 6 : 0;
  return <div className="product-page page-enter"><section className="accounts-hero panel"><div><span>Patrimônio em {selectedMonth.label}</span><strong>{brl.format(total)}</strong><small><TrendingUp size={14} /> Saldos reconstruídos para o período selecionado</small></div><div className="asset-ring"><span>{total ? Math.round(available / total * 100) : 0}%</span><small>disponível</small></div></section><section className="account-grid">{visible.map((account) => { const Icon = account.kind === "cash" ? Banknote : account.kind === "investment" ? TrendingUp : account.kind === "benefit" ? Gift : Landmark; const original = baseVisible.find((item) => item.id === account.id) ?? null; return <article className={`account-card panel ${selected?.id === account.id ? "selected" : ""}`} key={account.id}><button type="button" className="account-card-select" onClick={() => setSelectedId(account.id)}><div className={`account-icon ${account.color}`}><Icon size={21} /></div><span>{account.kind === "benefit" ? "Benefício / débito" : account.kind === "cash" ? "Dinheiro" : account.kind === "investment" ? "Reserva ou investimento" : "Conta bancária"}</span><h2>{account.name}</h2><strong>{brl.format(account.balance)}</strong><small>Ver painel da conta</small></button><button type="button" className="account-card-menu" onClick={() => onEdit(original)} aria-label={`Editar ${account.name}`}><MoreHorizontal size={18} /></button></article>; })}<button className="add-account-card" onClick={() => onEdit(null)}><Plus size={22} /><strong>Adicionar conta</strong><span>Banco, dinheiro, VA ou investimento</span></button></section>{selected && <section className="account-dashboard-grid"><article className="panel account-dashboard"><PanelHeader title={selected.name} action="Editar conta" onAction={() => onEdit(baseVisible.find((item) => item.id === selected.id) ?? null)} /><div className="account-kpis"><div><small>Saldo no período</small><strong>{brl.format(selected.balance)}</strong></div><div><small>Movimentações</small><strong>{periodTransactions.filter((item) => item.account === selected.name).length}</strong></div>{selected.kind === "investment" && <div><small>Rendimento mensal estimado</small><strong>{brl.format(monthlyYield)}</strong></div>}</div>{selected.kind === "investment" && <div className="reserve-goal-detail"><span><strong>Meta cadastrada</strong><small>{selected.goal ? brl.format(selected.goal) : "Ainda não definida"}</small></span><span><strong>Meta sugerida</strong><small>{recommendedReserve ? brl.format(recommendedReserve) : "Aguardando gastos essenciais"}</small></span><div className="progress"><i style={{ width: `${(selected.goal || recommendedReserve) ? Math.min(100, selected.balance / (selected.goal || recommendedReserve) * 100) : 0}%` }} /></div></div>}</article><article className="panel account-activity"><PanelHeader title="Movimentações do período" action="Novo lançamento" onAction={onNew} />{recent.length ? recent.map((item) => <button className="purchase-row" key={item.id} onClick={() => onEditTransaction(item)}><span className={`transaction-icon ${item.type}`}>{item.type === "income" ? <ArrowDownRight size={17} /> : <ArrowUpRight size={17} />}</span><span><strong>{item.description}</strong><small>{shortDate(item.date)} · {item.category}</small></span><strong className={item.type === "income" ? "income-text" : ""}>{item.type === "income" ? "+ " : "− "}{brl.format(item.amount)}</strong><Pencil size={15} /></button>) : <EmptyState icon={ReceiptText} title="Conta sem movimentações" text="Os lançamentos desta conta aparecerão aqui." />}</article></section>}<section className="account-detail-grid"><article className="panel yield-card"><PanelHeader title="Reservas e rendimento" action="Editar reserva" onAction={() => onEdit(baseVisible.find((item) => item.fixed && item.name === "Reserva de emergência") ?? baseVisible.find((item) => item.kind === "investment") ?? null)} /><div className="yield-main"><span><Coins size={20} /></span><div><small>Saldo reservado</small><strong>{brl.format(investment)}</strong></div><div><small>Rendimento estimado/mês</small><strong>{brl.format(visible.filter((item) => item.kind === "investment").reduce((sum, item) => sum + item.balance * item.monthlyYieldPercent / 100, 0))}</strong></div></div><div className="yield-estimate"><TrendingUp size={17} /><span>A estimativa usa a taxa mensal informada em cada reserva.</span></div></article><article className="panel balance-composition"><PanelHeader title="Composição do patrimônio" action="Adicionar conta" onAction={() => onEdit(null)} /><div className="composition-bar"><i style={{ width: `${total ? available / total * 100 : 0}%` }} /><i style={{ width: `${total ? investment / total * 100 : 0}%` }} /></div><div className="composition-legend"><span><i />Disponível <strong>{total ? Math.round(available / total * 100) : 0}%</strong></span><span><i />Reserva e investimentos <strong>{total ? Math.round(investment / total * 100) : 0}%</strong></span></div></article></section></div>;
}

function CardArtwork({ card }: { card: FinanceCard }) {
  const knownArtwork = card.color === "uv" || card.color === "caju";
  return <article className={`credit-card-visual card-photo ${card.color === "uv" ? "uv-photo" : card.color === "caju" ? "caju-photo" : "custom-card"}`} role="img" aria-label={`${card.name}, ${card.brand} ${card.tier}`}>
    {card.imageData ? <NextImage className="custom-card-image" src={card.imageData} alt="" fill unoptimized /> : !knownArtwork && <><div className="credit-card-top"><strong>{card.name}</strong><span>{card.brand}</span></div><span className="card-chip" /><div className="card-owner"><small>Cartão personalizado</small><strong>•••• {card.last4}</strong></div></>}
  </article>;
}

function CardsView({ cards, accounts, transactions, rewardRedemptions, selectedMonth, exchangeRate, onNew, onImport, onEditTransaction, onEditCard, onSelectMonth, onPayInvoice, onRedeemReward }: {
  cards: FinanceCard[]; accounts: FinanceAccount[]; transactions: FinanceTransaction[]; rewardRedemptions: FinanceRewardRedemption[]; selectedMonth: MonthOption; exchangeRate: FinanceExchangeRate | null;
  onNew: () => void; onImport: () => void; onEditTransaction: (item: FinanceTransaction) => void; onEditCard: (card: FinanceCard | null) => void; onSelectMonth: (month: string) => void; onPayInvoice: (payment: { cardId: string; invoiceMonth: string; sourceAccount: string; amount: number; date?: string }) => Promise<void>; onRedeemReward: (redemption: Omit<FinanceRewardRedemption, "id" | "createdAt">) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState(cards[0]?.id ?? "");
  const [payOpen, setPayOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragDelta, setDragDelta] = useState(0);
  const card = cards.find((item) => item.id === selectedId) ?? cards[0];
  const selectedIndex = Math.max(0, cards.findIndex((item) => item.id === card?.id));
  const preferredInvoiceMonth = card?.kind === "credit" ? defaultInvoiceMonthForCard(card, transactions, localDateKey()) : selectedMonth.key;
  const automaticSelection = useRef("");
  useEffect(() => {
    const signature = `${card?.id ?? "none"}:${preferredInvoiceMonth}`;
    if (!card || automaticSelection.current === signature) return;
    automaticSelection.current = signature;
    if (selectedMonth.key !== preferredInvoiceMonth) onSelectMonth(preferredInvoiceMonth);
  }, [card, onSelectMonth, preferredInvoiceMonth, selectedMonth.key]);

  if (!card) return <div className="product-page"><EmptyState icon={CreditCard} title="Nenhum cartão" text="Cadastre seu primeiro cartão." /><button className="primary-button centered-button" onClick={() => onEditCard(null)}>Adicionar cartão</button></div>;

  const monthMatches = (item: FinanceTransaction) => (item.invoiceMonth ?? item.date.slice(0, 7)) === selectedMonth.key;
  const belongsToCard = (item: FinanceTransaction) => item.cardId === card.id || (!item.cardId && item.account === card.linkedAccount);
  const purchases = transactions.filter((item) => item.type === "expense" && item.status !== "planned" && monthMatches(item) && belongsToCard(item)).sort((a, b) => b.date.localeCompare(a.date));
  const invoice = purchases.reduce((sum, item) => sum + item.amount, 0);
  const paid = transactions.filter((item) => item.type === "transfer" && item.source === "invoice-payment" && item.cardId === card.id && monthMatches(item)).reduce((sum, item) => sum + item.amount, 0);
  const remainingInvoice = Math.max(0, invoice - paid);
  const linkedAccount = accounts.find((item) => item.name === card.linkedAccount);
  const accountBalance = linkedAccount ? accountBalanceAtMonth(linkedAccount, transactions, selectedMonth.key) : 0;
  const futureMap = new Map<string, number>();
  transactions.filter((item) => item.type === "expense" && belongsToCard(item) && (item.invoiceMonth ?? item.date.slice(0, 7)) > selectedMonth.key).forEach((item) => { const key = item.invoiceMonth ?? item.date.slice(0, 7); futureMap.set(key, (futureMap.get(key) ?? 0) + item.amount); });
  const future = [...futureMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 4);
  const futureTotal = [...futureMap.values()].reduce((sum, amount) => sum + amount, 0);
  const usdRate = exchangeRate?.sell || card.manualUsdRate;
  const rewardTransactions = transactions.filter((item) => item.type === "expense" && item.status !== "planned" && belongsToCard(item) && (item.invoiceMonth ?? item.date.slice(0, 7)) <= selectedMonth.key);
  const rewardTotals = rewardTransactions.reduce((totals, item) => { const reward = rewardFor(item, card, usdRate); return { points: totals.points + reward.points, cashback: totals.cashback + reward.cashback }; }, { points: 0, cashback: 0 });
  const cardRedemptions = rewardRedemptions.filter((item) => item.cardId === card.id && item.date.slice(0, 7) <= selectedMonth.key);
  const points = Math.max(0, rewardTotals.points - cardRedemptions.filter((item) => item.kind === "points").reduce((sum, item) => sum + item.amount, 0));
  const cashback = Math.max(0, rewardTotals.cashback - cardRedemptions.filter((item) => item.kind === "cashback").reduce((sum, item) => sum + item.amount, 0));
  const limitPercent = card.limit > 0 ? Math.min(100, remainingInvoice / card.limit * 100) : 0;
  const closingDate = invoiceClosingDate(card, selectedMonth.key);
  const dueDate = invoiceDueDate(card, selectedMonth.key);

  function selectIndex(index: number) {
    const bounded = Math.max(0, Math.min(cards.length - 1, index));
    setSelectedId(cards[bounded].id);
    setPayOpen(false);
  }
  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    setDragStart(event.clientX); setDragDelta(0); event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStart == null) return;
    const resistance = (selectedIndex === 0 && event.clientX > dragStart) || (selectedIndex === cards.length - 1 && event.clientX < dragStart) ? .28 : 1;
    setDragDelta((event.clientX - dragStart) * resistance);
  }
  function finishDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragStart == null) return;
    const delta = event.clientX - dragStart;
    if (Math.abs(delta) > 52) selectIndex(selectedIndex + (delta < 0 ? 1 : -1));
    setDragStart(null); setDragDelta(0);
  }

  return <div className="product-page page-enter cards-page">
    <section className="card-carousel-head"><div className="card-tabs" aria-label="Selecionar cartão">{cards.map((item, index) => <button key={item.id} className={item.id === card.id ? "active" : ""} onClick={() => selectIndex(index)}><span className={`mini-card ${item.color}`}><CreditCard size={16} /></span><span><strong>{item.name}</strong><small>{item.kind === "credit" ? `${item.brand} ${item.tier}` : "Débito no saldo"}</small></span></button>)}</div><button className="secondary-button" onClick={() => onEditCard(null)}><Plus size={16} /> Novo cartão</button></section>
    <section className="card-overview-grid">
      <div className="card-visual-column">
        <div className="card-visual-viewport" tabIndex={0} aria-label={`Cartão ${selectedIndex + 1} de ${cards.length}. Arraste para trocar.`} onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={() => { setDragStart(null); setDragDelta(0); }} onKeyDown={(event) => { if (event.key === "ArrowLeft") selectIndex(selectedIndex - 1); if (event.key === "ArrowRight") selectIndex(selectedIndex + 1); }}>
          <div className={`card-visual-track ${dragStart == null ? "animated" : "dragging"}`} style={{ transform: `translate3d(calc(${-selectedIndex * 100}% + ${dragDelta}px),0,0)` }}>{cards.map((item, index) => <div className={`card-artwork-slide ${index === selectedIndex ? "active" : ""}`} key={item.id}><CardArtwork card={item} /></div>)}</div>
        </div>
        <div className="card-carousel-controls"><button onClick={() => selectIndex(selectedIndex - 1)} disabled={selectedIndex === 0} aria-label="Cartão anterior"><ChevronLeft size={18} /></button><div>{cards.map((item, index) => <button key={item.id} className={index === selectedIndex ? "active" : ""} onClick={() => selectIndex(index)} aria-label={`Abrir ${item.name}`} />)}</div><button onClick={() => selectIndex(selectedIndex + 1)} disabled={selectedIndex === cards.length - 1} aria-label="Próximo cartão"><ChevronRight size={18} /></button></div>
        <div className="card-stage-caption"><span>{card.name}</span><small>{card.kind === "credit" ? `${card.brand} ${card.tier} · final ${card.last4}` : `${card.brand} · débito no saldo`}</small></div>
      </div>
      <article key={`invoice-${card.id}`} className="panel invoice-overview card-panel-enter"><div className="invoice-title-row"><span>{card.kind === "credit" ? `Fatura de ${selectedMonth.label}` : "Saldo disponível no Caju"}</span><button className="icon-button compact" onClick={() => onEditCard(card)} aria-label="Configurar cartão"><Settings2 size={17} /></button></div><strong>{brl.format(card.kind === "credit" ? remainingInvoice : accountBalance)}</strong><small>{card.kind === "credit" && paid > 0 ? `${brl.format(paid)} já pagos · ${purchases.length} ${purchases.length === 1 ? "compra" : "compras"}` : `${purchases.length} ${purchases.length === 1 ? "compra registrada" : "compras registradas"}`}</small>{card.kind === "credit" ? <><div className="limit-row"><span>Limite livre e editável</span><strong>{card.limit ? `${brl.format(Math.max(0, card.limit - remainingInvoice))} de ${brl.format(card.limit)}` : "Ainda não informado"}</strong></div><div className="progress"><i style={{ width: `${limitPercent}%` }} /></div></> : <div className="debit-callout"><Gift size={17} /> Toda compra reduz diretamente o saldo da conta Caju VA.</div>}<div className="date-rules"><span><small>Fecha em dia útil</small><strong>{dateLabel(closingDate)}</strong></span><span><small>Vence em dia útil</small><strong>{dateLabel(dueDate)}</strong></span></div><div className="invoice-actions"><button className="secondary-button" onClick={onImport}><FileUp size={16} /> Importar</button>{card.kind === "credit" && remainingInvoice > 0 && <button className="secondary-button pay-invoice-button" onClick={() => setPayOpen(true)}><Check size={16} /> Pagar fatura</button>}<button className="primary-button" onClick={onNew}><Plus size={16} /> Nova compra</button></div></article>
      <article key={`rewards-${card.id}`} className="panel rewards-card card-panel-enter" role="button" tabIndex={0} onClick={() => setRewardsOpen(true)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setRewardsOpen(true); }}><div className="reward-title"><span><Award size={20} /></span><div><small>Recompensas acumuladas</small><strong>{card.rewardMode === "cashback" ? brl.format(cashback) : `${pointsNumber.format(points)} pontos`}</strong></div><ChevronRight className="reward-open-arrow" size={19} /></div><div className="points-target"><span>Meta de pontos</span><strong>{card.pointsGoal ? `${pointsNumber.format(points)} / ${card.pointsGoal.toLocaleString("pt-BR")}` : "Não configurada"}</strong></div><div className="progress"><i style={{ width: `${card.pointsGoal ? Math.min(100, points / card.pointsGoal * 100) : 0}%` }} /></div><div className="cashback-row"><span>Cashback calculado em {card.cashbackPercent.toLocaleString("pt-BR")}%</span><strong>{brl.format(cashback)}</strong></div><small>{usdRate ? `${card.pointsPerDollar.toLocaleString("pt-BR")} pts/US$ · dólar ${exchangeRate ? "PTAX BCB" : "manual"} em ${brl.format(usdRate)}` : "Informe uma cotação manual caso a PTAX esteja indisponível."}</small><div className="reward-history-callout"><History size={16} /><span><strong>Abrir extrato de pontos</strong><small>{rewardTransactions.length} transações com detalhamento individual</small></span></div><button className="text-button" onClick={(event) => { event.stopPropagation(); onEditCard(card); }}>Editar regras e meta</button></article>
    </section>
    <section key={`details-${card.id}`} className="card-detail-grid card-panel-enter"><article className="panel purchases-panel"><PanelHeader title={card.kind === "credit" ? "Últimas compras da fatura" : "Últimas compras no débito"} action={purchases.length ? `Ver extrato (${purchases.length})` : "Adicionar"} onAction={purchases.length ? () => setInvoiceOpen(true) : onNew} />{purchases.length ? purchases.slice(0, 5).map((purchase) => <button className="purchase-row" key={purchase.id} onClick={() => onEditTransaction(purchase)}><span className="purchase-icon"><CreditCard size={17} /></span><span><strong>{purchase.description}</strong><small>{shortDate(purchase.date)} · {purchase.category}</small></span><span><small>{purchase.installments ? `Parcela ${purchase.installments}` : card.kind === "credit" ? "À vista" : "Débito"}</small><strong>{brl.format(purchase.amount)}</strong></span><Pencil size={15} /></button>) : <EmptyState icon={CreditCard} title="Nenhuma compra" text="Cadastre uma compra ou importe um arquivo." />}{purchases.length > 5 && <button className="invoice-more-button" onClick={() => setInvoiceOpen(true)}>Ver mais {purchases.length - 5} transações <ChevronRight size={16} /></button>}</article><article className="panel future-invoices"><PanelHeader title="Compromissos futuros" action="Nova compra" onAction={onNew} />{card.kind === "credit" && future.length ? future.map(([key, value]) => <div className="future-row" key={key}><span>{shortMonthFormatter.format(new Date(`${key}-01T12:00:00Z`))}</span><span className="progress"><i style={{ width: `${futureTotal ? value / futureTotal * 100 : 0}%` }} /></span><strong>{brl.format(value)}</strong></div>) : <EmptyState icon={CalendarDays} title="Sem compromissos futuros" text={card.kind === "credit" ? "Parcelas futuras aparecerão aqui." : "Cartões de débito não geram faturas futuras."} />}<div className="commitment-total"><span>Total ainda comprometido</span><strong>{brl.format(card.kind === "credit" ? futureTotal : 0)}</strong></div></article></section>
    {payOpen && <PayInvoiceModal card={card} month={selectedMonth} remaining={remainingInvoice} accounts={accounts.filter((item) => item.kind !== "credit-card")} onClose={() => setPayOpen(false)} onPay={async (payment) => { await onPayInvoice(payment); setPayOpen(false); }} />}
    {rewardsOpen && <RewardsStatementModal card={card} transactions={transactions} redemptions={rewardRedemptions} accounts={accounts.filter((item) => item.kind !== "credit-card")} selectedMonth={selectedMonth} fallbackUsdRate={usdRate} onRedeem={onRedeemReward} onClose={() => setRewardsOpen(false)} onEditTransaction={(item) => { setRewardsOpen(false); onEditTransaction(item); }} />}
    {invoiceOpen && <InvoiceStatementModal card={card} month={selectedMonth} purchases={purchases} paid={paid} onClose={() => setInvoiceOpen(false)} onEditTransaction={(item) => { setInvoiceOpen(false); onEditTransaction(item); }} />}
  </div>;
}

function InvoiceStatementModal({ card, month, purchases, paid, onClose, onEditTransaction }: { card: FinanceCard; month: MonthOption; purchases: FinanceTransaction[]; paid: number; onClose: () => void; onEditTransaction: (item: FinanceTransaction) => void }) {
  const [grouping, setGrouping] = useState<"month" | "week" | "day">("month");
  const [search, setSearch] = useState("");
  const normalized = search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = purchases.filter((item) => `${item.description} ${item.category}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalized));
  const groupLabel = (item: FinanceTransaction) => {
    if (grouping === "month") return month.label;
    const date = new Date(`${item.date}T12:00:00Z`);
    if (grouping === "day") return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" }).format(date).replace(/^./, (letter) => letter.toUpperCase());
    const weekday = date.getUTCDay() || 7;
    const start = new Date(date); start.setUTCDate(date.getUTCDate() - weekday + 1);
    const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
    const format = (value: Date) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(value);
    return `Semana de ${format(start)} a ${format(end)}`;
  };
  const groups = new Map<string, FinanceTransaction[]>();
  visible.forEach((item) => { const key = groupLabel(item); groups.set(key, [...(groups.get(key) ?? []), item]); });
  const gross = purchases.reduce((sum, item) => sum + item.amount, 0);
  return <div className="modal-layer nested" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal invoice-statement-modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">{card.kind === "credit" ? "Fatura detalhada" : "Extrato do cartão"}</span><h2>{card.name}</h2><p>{month.label} · {purchases.length} transações</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="invoice-statement-summary"><div><small>Total de compras</small><strong>{brl.format(gross)}</strong></div>{card.kind === "credit" && <><div><small>Já pago</small><strong>{brl.format(paid)}</strong></div><div><small>Em aberto</small><strong>{brl.format(Math.max(0, gross - paid))}</strong></div></>}</div><div className="invoice-statement-tools"><div className="invoice-grouping" aria-label="Organizar fatura">{(["month", "week", "day"] as const).map((mode) => <button type="button" className={grouping === mode ? "active" : ""} key={mode} onClick={() => setGrouping(mode)}>{mode === "month" ? "Mês" : mode === "week" ? "Semana" : "Dia"}</button>)}</div><div className="reward-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar na fatura" /></div></div><div className="invoice-statement-list">{[...groups.entries()].map(([label, items]) => <section key={label}><div className="invoice-group-header"><span>{label}</span><strong>{brl.format(items.reduce((sum, item) => sum + item.amount, 0))}</strong></div>{items.map((item) => <button className="purchase-row" key={item.id} onClick={() => onEditTransaction(item)}><span className="purchase-icon"><CreditCard size={17} /></span><span><strong>{item.description}</strong><small>{shortDate(item.date)} · {item.category}</small></span><span><small>{item.installments ? `Parcela ${item.installments}` : "À vista"}</small><strong>{brl.format(item.amount)}</strong></span><Pencil size={15} /></button>)}</section>)}{!visible.length && <EmptyState icon={Search} title="Nenhuma compra encontrada" text="Tente outra descrição ou categoria." />}</div></section></div>;
}

function RewardsStatementModal({ card, transactions, redemptions, accounts, selectedMonth, fallbackUsdRate, onClose, onEditTransaction, onRedeem }: { card: FinanceCard; transactions: FinanceTransaction[]; redemptions: FinanceRewardRedemption[]; accounts: FinanceAccount[]; selectedMonth: MonthOption; fallbackUsdRate: number; onClose: () => void; onEditTransaction: (item: FinanceTransaction) => void; onRedeem: (redemption: Omit<FinanceRewardRedemption, "id" | "createdAt">) => Promise<void> }) {
  const [search, setSearch] = useState(""); const [redeemOpen, setRedeemOpen] = useState(false);
  const rewardEntries = transactions.filter((item) => item.type === "expense" && item.status !== "planned" && (item.cardId === card.id || (!item.cardId && item.account === card.linkedAccount)) && (item.invoiceMonth ?? item.date.slice(0, 7)) <= selectedMonth.key).sort((a, b) => a.date.localeCompare(b.date)).map((transaction) => ({ transaction, ...rewardFor(transaction, card, fallbackUsdRate) }));
  const entries = rewardEntries.map((entry, index) => ({ ...entry, runningPoints: rewardEntries.slice(0, index + 1).reduce((sum, item) => sum + item.points, 0) }));
  const normalizedSearch = search.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = [...entries].reverse().filter(({ transaction }) => `${transaction.description} ${transaction.category}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(normalizedSearch));
  const totalPoints = entries.reduce((sum, item) => sum + item.points, 0); const totalCashback = entries.reduce((sum, item) => sum + item.cashback, 0); const totalSpend = entries.reduce((sum, item) => sum + item.transaction.amount, 0);
  const cardRedemptions = redemptions.filter((item) => item.cardId === card.id && item.date.slice(0, 7) <= selectedMonth.key).sort((a, b) => b.date.localeCompare(a.date));
  const availablePoints = Math.max(0, totalPoints - cardRedemptions.filter((item) => item.kind === "points").reduce((sum, item) => sum + item.amount, 0));
  const availableCashback = Math.max(0, totalCashback - cardRedemptions.filter((item) => item.kind === "cashback").reduce((sum, item) => sum + item.amount, 0));
  return <div className="modal-layer nested" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal rewards-statement-modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">Histórico por transação</span><h2>Extrato de recompensas</h2><p>{card.name} · até {selectedMonth.label}</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar extrato"><X size={19} /></button></div><div className="reward-statement-summary"><div><small>Pontos disponíveis</small><strong>{pointsNumber.format(availablePoints)}</strong><span>de {card.pointsGoal ? card.pointsGoal.toLocaleString("pt-BR") : "meta não definida"}</span></div><div><small>Cashback disponível</small><strong>{brl.format(availableCashback)}</strong><span>{card.cashbackPercent.toLocaleString("pt-BR")}% configurado</span></div><div><small>Compras consideradas</small><strong>{brl.format(totalSpend)}</strong><span>{entries.length} transações</span></div></div><div className="reward-statement-progress"><span><strong>Progresso da meta</strong><small>{card.pointsGoal ? `${Math.min(100, availablePoints / card.pointsGoal * 100).toFixed(1).replace(".", ",")}%` : "Configure uma meta no cartão"}</small></span><div className="progress"><i style={{ width: `${card.pointsGoal ? Math.min(100, availablePoints / card.pointsGoal * 100) : 0}%` }} /></div><button className="primary-button reward-redeem-button" type="button" disabled={!availablePoints && !availableCashback} onClick={() => setRedeemOpen(true)}><Repeat2 size={16} /> Resgatar</button></div><div className="reward-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar no extrato" aria-label="Buscar transação no extrato de pontos" /></div><div className="reward-statement-list">{visible.length ? visible.map((entry) => <button key={entry.transaction.id} onClick={() => onEditTransaction(entry.transaction)}><span className="reward-entry-icon"><Award size={17} /></span><span><strong>{entry.transaction.description}</strong><small>{shortDate(entry.transaction.date)} · {entry.transaction.category}{entry.transaction.installments ? ` · ${entry.transaction.installments}` : ""}</small><em>{entry.usdRate ? `${brl.format(entry.transaction.amount)} ÷ dólar ${brl.format(entry.usdRate)}` : brl.format(entry.transaction.amount)}{entry.estimated ? " · estimativa atual" : " · cotação registrada"}</em></span><span><strong>+ {pointsNumber.format(entry.points)} pts</strong><small>{brl.format(entry.cashback)} cashback</small><em>Acumulado bruto: {pointsNumber.format(entry.runningPoints)} pts</em></span><ChevronRight size={16} /></button>) : <EmptyState icon={Award} title="Nenhuma recompensa encontrada" text={search ? "Tente outra descrição ou categoria." : "As compras elegíveis aparecerão aqui, uma por transação."} />}</div>{cardRedemptions.length > 0 && <section className="reward-redemption-history"><div><strong>Resgates realizados</strong><small>O saldo disponível já considera estes movimentos.</small></div>{cardRedemptions.map((item) => <article key={item.id}><span className="reward-entry-icon"><Repeat2 size={16} /></span><span><strong>{item.kind === "points" ? `${pointsNumber.format(item.amount)} pontos` : brl.format(item.amount)}</strong><small>{shortDate(item.date)}{item.account ? ` · crédito em ${item.account}` : ""}</small>{item.note && <em>{item.note}</em>}</span><strong>− {item.kind === "points" ? `${pointsNumber.format(item.amount)} pts` : brl.format(item.amount)}</strong></article>)}</section>}<div className="reward-statement-note"><Sparkles size={16} /><span>Novas compras guardam a cotação usada no cálculo. Lançamentos antigos sem cotação salva aparecem como estimativa pela regra atual.</span></div></section>{redeemOpen && <RewardRedemptionModal card={card} availablePoints={availablePoints} availableCashback={availableCashback} accounts={accounts} onClose={() => setRedeemOpen(false)} onRedeem={async (redemption) => { await onRedeem(redemption); setRedeemOpen(false); }} />}</div>;
}

function RewardRedemptionModal({ card, availablePoints, availableCashback, accounts, onClose, onRedeem }: { card: FinanceCard; availablePoints: number; availableCashback: number; accounts: FinanceAccount[]; onClose: () => void; onRedeem: (redemption: Omit<FinanceRewardRedemption, "id" | "createdAt">) => Promise<void> }) {
  const [kind, setKind] = useState<"points" | "cashback">(availablePoints > 0 ? "points" : "cashback"); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const available = kind === "points" ? availablePoints : availableCashback;
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const amount = parseMoney(String(data.get("amount") || "0")); if (!Number.isFinite(amount) || amount <= 0 || amount > available) { setError(`Informe um valor de até ${kind === "points" ? `${pointsNumber.format(available)} pontos` : brl.format(available)}.`); return; } setBusy(true); setError(""); try { await onRedeem({ cardId: card.id, kind, amount, account: kind === "cashback" ? String(data.get("account") || "") : undefined, date: String(data.get("date") || localDateKey()), note: String(data.get("note") || "").trim() || undefined }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível registrar o resgate."); } finally { setBusy(false); } }
  return <div className="modal-layer reward-redemption-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal small reward-redemption-modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">Saldo de recompensas</span><h2>Registrar resgate</h2><p>Você pode resgatar apenas uma parte e manter o restante disponível.</p></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="type-segment reward-kind"><button type="button" className={kind === "points" ? "active" : ""} disabled={!availablePoints} onClick={() => setKind("points")}><Award size={16} /> Pontos</button><button type="button" className={kind === "cashback" ? "active" : ""} disabled={!availableCashback} onClick={() => setKind("cashback")}><Coins size={16} /> Cashback</button></div><form onSubmit={submit}><div className="reward-available wide"><small>Disponível para resgate</small><strong>{kind === "points" ? `${pointsNumber.format(available)} pontos` : brl.format(available)}</strong></div><label>Valor do resgate<input name="amount" inputMode="decimal" defaultValue={formatInput(available)} required /></label><label>Data<input name="date" type="date" defaultValue={localDateKey()} required /></label>{kind === "cashback" && <label className="wide">Conta que receberá o cashback<select name="account" defaultValue={accounts.find((item) => item.kind === "checking")?.name ?? accounts[0]?.name}>{accounts.map((account) => <option key={account.id} value={account.name}>{account.name} · {brl.format(account.balance)}</option>)}</select></label>}<label className="wide">Observação opcional<input name="note" maxLength={180} placeholder={kind === "points" ? "Ex.: troca por passagem" : "Ex.: crédito recebido do cartão"} /></label>{error && <div className="import-error wide"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions wide"><button className="ghost-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={busy || available <= 0}>{busy ? "Registrando…" : kind === "points" ? "Resgatar pontos" : "Transferir cashback"}</button></div></form></section></div>;
}

function PayInvoiceModal({ card, month, remaining, accounts, onClose, onPay }: { card: FinanceCard; month: MonthOption; remaining: number; accounts: FinanceAccount[]; onClose: () => void; onPay: (payment: { cardId: string; invoiceMonth: string; sourceAccount: string; amount: number; date?: string }) => Promise<void> }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const amount = parseMoney(String(data.get("amount") || "0")); if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) { setError("Informe um valor válido, até o saldo restante da fatura."); return; } try { await onPay({ cardId: card.id, invoiceMonth: month.key, sourceAccount: String(data.get("sourceAccount")), amount, date: String(data.get("date")) }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível pagar a fatura."); } }
  return <div className="modal-layer nested" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal small"><div className="modal-header"><div><span className="eyebrow">Transferência entre saldos</span><h2>Pagar fatura</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="invoice-payment-summary"><span>{card.name} · {month.label}</span><strong>{brl.format(remaining)}</strong><small>restante em aberto</small></div><form onSubmit={submit}><label className="wide">Saldo usado no pagamento<select name="sourceAccount" defaultValue={accounts.find((item) => item.kind === "checking" && item.balance >= remaining)?.name ?? accounts.find((item) => item.balance >= remaining)?.name ?? accounts[0]?.name}>{accounts.map((account) => <option key={account.id} value={account.name}>{account.name} · {brl.format(account.balance)}</option>)}</select></label><label>Valor a pagar<input name="amount" inputMode="decimal" defaultValue={formatInput(remaining)} required /></label><label>Data do pagamento<input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><div className="calendar-preview wide"><Check size={17} /><span>O valor será abatido da conta e da fatura. A operação fica no histórico, sem virar uma nova despesa.</span></div>{error && <div className="import-error wide"><AlertTriangle size={17} />{error}</div>}<div className="modal-actions wide"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">Confirmar pagamento</button></div></form></section></div>;
}

function RecurringModal({ rules, categories, accounts, cards, onClose, onSave }: { rules: FinanceRecurringRule[]; categories: FinanceCategory[]; accounts: FinanceAccount[]; cards: FinanceCard[]; onClose: () => void; onSave: (rule: Omit<FinanceRecurringRule, "effectiveDate" | "businessDays" | "projectedAmount">) => Promise<void> }) {
  const [type, setType] = useState<"expense" | "income">("expense"); const [method, setMethod] = useState<PaymentMethod>("debit"); const [error, setError] = useState(""); const categoryOptions = categories.filter((item) => item.kind === type);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const amount = parseMoney(String(data.get("amount") || "0")); const description = String(data.get("description") || "").trim(); const dayOfMonth = Number(data.get("dayOfMonth")); if (!description || !Number.isFinite(amount) || amount <= 0 || dayOfMonth < 1 || dayOfMonth > 31) { setError("Preencha descrição, valor e dia válidos."); return; } const card = cards.find((item) => item.id === String(data.get("cardId") || "")); try { await onSave({ id: createId(), description, type, category: String(data.get("category") || "Outros"), account: method === "credit" && card ? card.linkedAccount : String(data.get("account") || accounts[0]?.name), amount, dayOfMonth, calculationMode: "fixed", scheduleMode: String(data.get("scheduleMode")) as FinanceRecurringRule["scheduleMode"], dateAdjustment: String(data.get("dateAdjustment")) as FinanceRecurringRule["dateAdjustment"], paymentMethod: type === "income" ? "transfer" : method, cardId: type === "expense" && method === "credit" ? card?.id : undefined, active: true }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar a recorrência."); } }
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal recurring-modal"><div className="modal-header"><div><span className="eyebrow">Automação mensal</span><h2>Novo lançamento recorrente</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>{rules.length > 0 && <div className="recurring-existing"><span>{rules.length} {rules.length === 1 ? "regra ativa" : "regras ativas"}</span>{rules.slice(0, 3).map((rule) => <small key={rule.id}>{rule.description} · {brl.format(rule.amount)}</small>)}</div>}<form onSubmit={submit}><label>Tipo<select value={type} onChange={(event) => { const next = event.target.value as "expense" | "income"; setType(next); setMethod(next === "income" ? "transfer" : "debit"); }}><option value="expense">Saída recorrente</option><option value="income">Entrada recorrente</option></select></label><label>Dia do mês<input name="dayOfMonth" type="number" min="1" max="31" defaultValue="1" required /></label><label className="wide">Descrição<input name="description" placeholder={type === "expense" ? "Ex.: Seguro do carro" : "Ex.: Auxílio da faculdade"} autoFocus required /></label><label>Valor<input name="amount" inputMode="decimal" placeholder="0,00" required /></label><label>Categoria<select name="category" defaultValue={categoryOptions[0]?.name}>{categoryOptions.map((category) => <option key={category.id}>{category.name}</option>)}</select></label>{type === "expense" && <label>Forma de pagamento<select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}><option value="debit">Débito em conta</option><option value="credit">Cartão de crédito</option><option value="cash">Dinheiro</option><option value="transfer">Pix / transferência</option></select></label>}{type === "expense" && method === "credit" ? <label>Cartão<select name="cardId">{cards.filter((card) => card.kind === "credit").map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label> : <label>Conta<select name="account">{accounts.map((account) => <option key={account.id}>{account.name}</option>)}</select></label>}<label>Regra de data<select name="scheduleMode"><option value="day-of-month">Dia fixo do mês</option><option value="business-day-of-month">Nº do dia útil</option></select></label><label>Ajuste em fim de semana/feriado<select name="dateAdjustment"><option value="previous">Dia útil anterior</option><option value="next">Próximo dia útil</option></select></label><div className="calendar-preview wide"><CalendarDays size={17} /><span>A recorrência será lançada como prevista nos próximos 12 meses e poderá ser confirmada ou corrigida em Lançamentos.</span></div>{error && <div className="import-error wide"><AlertTriangle size={17} />{error}</div>}<div className="modal-actions wide"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">Salvar recorrência</button></div></form></section></div>;
}

function PlanningView({ transactions, salaryRule, benefitRule, recurringRules, selectedMonth, onRecurring }: { transactions: FinanceTransaction[]; salaryRule: FinanceSalaryRule | null; benefitRule: FinanceBenefitRule | null; recurringRules: FinanceRecurringRule[]; selectedMonth: MonthOption; onRecurring: () => void }) {
  const start = new Date(`${selectedMonth.key}-01T12:00:00Z`);
  const projected = Array.from({ length: 3 }, (_, offset) => {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset + 1, 1));
    const key = date.toISOString().slice(0, 7);
    const items = transactionsForCommitmentMonth(transactions, key);
    const actual = totalsFor(items);
    const recurringPresent = items.some((item) => item.source === "recurring" && item.type === "income");
    const projectedRecurring = recurringPresent ? 0 : (salaryRule?.active ? salaryRule.amount : 0) + (benefitRule?.active ? benefitRule.amount * businessDaysInMonth(key) : 0);
    const income = actual.income + projectedRecurring;
    return { key, month: monthFormatter.format(date).replace(/^./, (letter) => letter.toUpperCase()), income, committed: actual.expenses, free: income - actual.expenses, workdays: businessDaysInMonth(key) };
  });
  return <div className="product-page page-enter"><section className="planning-head panel"><div><span>Visão dos próximos meses</span><h2>Seu futuro financeiro, antes das decisões</h2><p>Parcelas, salário, VA e demais recorrências entram automaticamente na projeção.</p></div><button className="primary-button" onClick={onRecurring}><Repeat2 size={17} /> Nova recorrência</button></section><section className="projection-grid">{projected.map((item) => <article className="panel projection-card" key={item.key}><div><span>{item.month}</span><small className={item.free >= 0 ? "healthy-pill" : "warning-pill"}>{item.free >= 0 ? "Positivo" : "Atenção"}</small></div><strong>{brl.format(item.free)}</strong><span>livres após compromissos</span><dl><div><dt>Renda prevista</dt><dd>{brl.format(item.income)}</dd></div><div><dt>Já comprometido</dt><dd>{brl.format(item.committed)}</dd></div><div><dt>Dias úteis para VA</dt><dd>{item.workdays}</dd></div></dl></article>)}</section><section className="planning-grid"><article className="panel recurring-panel"><PanelHeader title="Lançamentos recorrentes" action="Cadastrar" onAction={onRecurring} />{recurringRules.length ? recurringRules.map((rule) => <button className="recurring-row" key={rule.id} onClick={onRecurring}><span className={`transaction-icon ${rule.type}`}><Repeat2 size={17} /></span><span><strong>{rule.description}</strong><small>{rule.type === "income" ? "Entrada" : "Saída"} · dia {rule.dayOfMonth} · {rule.account}</small></span><strong>{brl.format(rule.projectedAmount ?? rule.amount)}</strong><ChevronRight size={16} /></button>) : <EmptyState icon={Repeat2} title="Nenhuma recorrência personalizada" text="Cadastre seguro, auxílio, renda extra ou qualquer entrada e saída mensal." />}</article><article className="panel budget-planning"><PanelHeader title="Orçamentos por categoria" action="Próxima etapa" onAction={() => undefined} /><EmptyState icon={Target} title="Limites por categoria em preparação" text="As categorias personalizadas já estão prontas para receber limites mensais." /></article></section></div>;
}

function ReportsView({ transactions, selectedMonth }: { transactions: FinanceTransaction[]; selectedMonth: MonthOption }) {
  const [reportType, setReportType] = useState<"expense" | "income">("expense");
  const [period, setPeriod] = useState("6");
  const [category, setCategory] = useState("all");
  const monthCount = period === "all" ? 120 : Number(period);
  const end = new Date(`${selectedMonth.key}-01T12:00:00Z`);
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - monthCount + 1, 1));
  const periodItems = transactions.filter((item) => item.type === reportType && new Date(`${calendarMonthOf(item)}-01T12:00:00Z`) >= start && new Date(`${calendarMonthOf(item)}-01T12:00:00Z`) <= end);
  const categoryOptions = [...new Set(periodItems.map((item) => item.category))].sort();
  const filtered = category === "all" ? periodItems : periodItems.filter((item) => item.category === category);
  const total = filtered.reduce((sum, item) => sum + item.amount, 0);
  const grouped = new Map<string, number>();
  filtered.forEach((item) => grouped.set(item.category, (grouped.get(item.category) ?? 0) + item.amount));
  const groupedRows = [...grouped.entries()].sort((a, b) => b[1] - a[1]);
  const largest = groupedRows[0];
  const months = Array.from({ length: Math.min(monthCount, 12) }, (_, index) => {
    const date = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - Math.min(monthCount, 12) + index + 1, 1));
    const key = date.toISOString().slice(0, 7);
    return { key, label: shortMonthFormatter.format(date).replace(".", ""), value: filtered.filter((item) => calendarMonthOf(item) === key).reduce((sum, item) => sum + item.amount, 0) };
  });
  const maxMonth = Math.max(...months.map((item) => item.value), 1);
  function exportCsv() {
    const header = "data;tipo;descricao;categoria;conta;valor\n";
    const rows = filtered.map((item) => `${item.date};${item.type};"${item.description.replaceAll('"', '""')}";"${item.category}";"${item.account}";${item.amount.toFixed(2).replace(".", ",")}`).join("\n");
    const url = URL.createObjectURL(new Blob([header + rows], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `fluxo-${reportType}-${selectedMonth.key}.csv`; link.click(); URL.revokeObjectURL(url);
  }
  return <div className="product-page page-enter"><section className="report-builder panel"><div><span className="eyebrow">Relatório personalizado</span><h2>De onde vem e para onde vai seu dinheiro</h2></div><div className="report-controls"><label>Fluxo<select value={reportType} onChange={(event) => { setReportType(event.target.value as "expense" | "income"); setCategory("all"); }}><option value="expense">Saídas</option><option value="income">Entradas</option></select></label><label>Período<select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="3">Últimos 3 meses</option><option value="6">Últimos 6 meses</option><option value="12">Últimos 12 meses</option><option value="all">Todo o histórico</option></select></label><label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todas</option>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label><button className="primary-button" onClick={exportCsv}><Download size={16} /> Exportar CSV</button></div></section><section className="report-kpis"><article className="panel"><span>Total analisado</span><strong>{brl.format(total)}</strong><small>{filtered.length} lançamentos</small></article><article className="panel"><span>Média por lançamento</span><strong>{brl.format(filtered.length ? total / filtered.length : 0)}</strong><small>No período selecionado</small></article><article className="panel"><span>Maior categoria</span><strong>{largest?.[0] ?? "—"}</strong><small>{largest && total ? `${Math.round(largest[1] / total * 100)}% do fluxo` : "Sem dados"}</small></article><article className="panel"><span>Origem analisada</span><strong>{reportType === "expense" ? "Saídas" : "Entradas"}</strong><small>{category === "all" ? "Todas as categorias" : category}</small></article></section><section className="report-grid"><article className="panel category-report"><PanelHeader title={`${reportType === "expense" ? "Saídas" : "Entradas"} por categoria`} action="Exportar" onAction={exportCsv} />{groupedRows.length ? <div className="category-chart">{groupedRows.map(([label, value]) => <div key={label}><span>{label}</span><span className="category-bar"><i style={{ width: `${total ? value / total * 100 : 0}%` }} /></span><strong>{brl.format(value)}</strong><small>{total ? Math.round(value / total * 100) : 0}%</small></div>)}</div> : <EmptyState icon={ChartNoAxesCombined} title="Relatório zerado" text="Os gráficos aparecem com seus lançamentos." />}</article><article className="panel report-insights"><div className="insight-title"><span><Sparkles size={19} /></span><div><small>EVOLUÇÃO NO PERÍODO</small><h2>{category === "all" ? "Todas as categorias" : category}</h2></div></div><div className="trend-chart">{months.map((item) => <div key={item.key}><span><i style={{ height: `${Math.max(item.value ? 8 : 0, item.value / maxMonth * 100)}%` }} /></span><small>{item.label}</small><strong>{item.value ? brl.format(item.value) : "—"}</strong></div>)}</div></article></section></div>;
}

function TransactionModal({ editing, categories, accounts, cards, trips, onClose, onSubmit, onDelete }: { editing: FinanceTransaction | null; categories: FinanceCategory[]; accounts: FinanceAccount[]; cards: FinanceCard[]; trips: FinanceTrip[]; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onDelete?: () => void }) {
  const [type, setType] = useState<TransactionType>(editing?.type ?? "expense");
  const inferredMethod: PaymentMethod = editing?.paymentMethod ?? (editing?.cardId || isCardAccount(editing?.account ?? "") ? "credit" : "debit");
  const [method, setMethod] = useState<PaymentMethod>(inferredMethod);
  const options = categories.filter((item) => item.kind === type);
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">Movimentação precisa</span><h2>{editing ? "Editar lançamento" : "Novo lançamento"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></div><form onSubmit={onSubmit}><label>Tipo<select name="type" value={type} onChange={(event) => { const next = event.target.value as TransactionType; setType(next); if (next === "income" || next === "transfer") setMethod("transfer"); }}><option value="expense">Despesa</option><option value="income">Receita</option><option value="transfer">Transferência entre contas</option></select></label><label>Data<input name="date" type="date" defaultValue={editing?.date ?? localDateKey()} required /></label><label className="wide">Descrição<input name="description" defaultValue={editing?.description ?? (type === "transfer" ? "Transferência entre contas" : "")} placeholder="Ex.: Mercado da semana" autoFocus required /></label><label>Valor{editing?.installments ? " desta parcela" : " total"}<input name="amount" inputMode="decimal" defaultValue={editing ? formatInput(editing.amount) : ""} placeholder="0,00" required /></label>{type !== "transfer" && <label>Categoria<select name="category" defaultValue={editing?.category ?? options[0]?.name}>{options.map((item) => <option key={item.id}>{item.name}</option>)}</select></label>}{type === "expense" && <label>Forma de pagamento<select name="paymentMethod" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}><option value="debit">Débito em conta/saldo</option><option value="credit">Cartão de crédito</option><option value="cash">Dinheiro</option><option value="transfer">Pix ou transferência</option></select></label>}{method === "credit" && type === "expense" ? <label>Cartão<select name="cardId" defaultValue={editing?.cardId ?? cards.find((card) => card.kind === "credit")?.id}>{cards.filter((card) => card.kind === "credit").map((card) => <option value={card.id} key={card.id}>{card.name}</option>)}</select></label> : <label>{type === "transfer" ? "Conta de origem" : "Conta ou saldo"}<select name="account" defaultValue={editing?.account ?? accounts[0]?.name}>{accounts.map((account) => <option key={account.id}>{account.name}</option>)}</select></label>}{type === "transfer" && <label>Conta de destino<select name="destinationAccount" defaultValue={editing?.destinationAccount ?? accounts.find((account) => account.name !== editing?.account)?.name ?? accounts[1]?.name ?? accounts[0]?.name}>{accounts.map((account) => <option key={account.id}>{account.name}</option>)}</select></label>}{!editing && type === "expense" && method === "credit" && <label>Número de parcelas<input name="installmentCount" type="number" min="1" max="48" defaultValue="1" /></label>}{editing?.status === "planned" && <label>Status<select name="status" defaultValue="planned"><option value="planned">Previsto</option><option value="confirmed">Confirmado</option></select></label>}{type !== "transfer" && <label className="wide travel-tag-field"><span><Plane size={14} /> Identificação de viagem</span><select name="tripId" defaultValue={editing?.tripId ?? ""}><option value="">Sem viagem</option>{trips.map((trip) => <option key={trip.id} value={trip.id}>{trip.name} · {trip.currency} · {shortDate(trip.startDate)} a {shortDate(trip.endDate)}</option>)}</select><small>Funciona como uma tag: a conta, a fatura e a categoria continuam normais.</small></label>}<small className="form-hint wide">{type === "transfer" ? "O valor sai da origem e entra no destino sem contar como receita ou despesa." : editing?.status === "planned" ? "Confirme quando a recorrência acontecer para atualizar o saldo." : editing?.installments ? `Você está editando somente a parcela ${editing.installments}.` : method === "credit" ? "O valor total será distribuído pelas faturas mensais." : "O valor afeta diretamente o saldo da conta selecionada."}</small><div className="modal-actions wide">{onDelete && <button type="button" className="danger-button" onClick={onDelete}><Trash2 size={16} /> Excluir</button>}<span className="modal-spacer" /><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit">{editing ? "Salvar correção" : "Salvar lançamento"}</button></div></form></section></div>;
}

function TripModal({ trip, onClose, onSave, onDelete }: {
  trip: FinanceTrip | null; onClose: () => void;
  onSave: (trip: Omit<FinanceTrip, "createdAt" | "updatedAt">) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [currency, setCurrency] = useState((trip?.currency ?? "USD").toUpperCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const startDate = String(data.get("startDate") || "");
    const endDate = String(data.get("endDate") || "");
    const exchangeRate = parseMoney(String(data.get("exchangeRate") || "0"));
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) { setError("Informe um nome e um período válido para a viagem."); return; }
    if (!/^[A-Z]{3}$/.test(currency) || !Number.isFinite(exchangeRate) || exchangeRate <= 0) { setError("Use o código de três letras da moeda e uma cotação maior que zero."); return; }
    setBusy(true); setError("");
    try { await onSave({ id: trip?.id ?? createId(), name, startDate, endDate, currency, exchangeRate }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar a viagem."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!onDelete || busy) return;
    setBusy(true); setError("");
    try { await onDelete(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível excluir a viagem."); }
    finally { setBusy(false); }
  }
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal trip-modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">MODO VIAGEM</span><h2>{trip ? "Editar viagem" : "Nova viagem"}</h2><p>Os lançamentos identificados continuam afetando normalmente seus saldos e faturas.</p></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={19} /></button></div><form onSubmit={submit}><label className="wide">Nome da viagem<input name="name" defaultValue={trip?.name ?? ""} placeholder="Ex.: Buenos Aires 2026" autoFocus required /></label><label>Data de início<input name="startDate" type="date" defaultValue={trip?.startDate ?? localDateKey()} required /></label><label>Data final<input name="endDate" type="date" defaultValue={trip?.endDate ?? localDateKey()} required /></label><label>Moeda utilizada<input name="currency" value={currency} onChange={(event) => setCurrency(event.target.value.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase())} maxLength={3} placeholder="USD" required /></label><label>Cotação atual <small>1 {currency || "MOEDA"} em reais</small><input name="exchangeRate" inputMode="decimal" defaultValue={formatInput(trip?.exchangeRate ?? 1)} placeholder="Ex.: 5,60" required /></label><div className="trip-modal-preview wide"><span><Coins size={18} /></span><div><strong>1 {currency || "MOEDA"} = {trip?.exchangeRate ? brl.format(trip.exchangeRate) : "cotação informada"}</strong><small>A conversão serve para consulta. O valor oficial do lançamento permanece em reais.</small></div></div>{error && <div className="import-error wide"><AlertTriangle size={17} />{error}</div>}<div className="modal-actions wide">{onDelete && <button type="button" className="danger-button" disabled={busy} onClick={() => void remove()}><Trash2 size={16} /> Excluir viagem</button>}<span className="modal-spacer" /><button type="button" className="ghost-button" disabled={busy} onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar viagem"}</button></div></form></section></div>;
}

function IncomeRulesModal({ salary, benefit, accounts, onClose, onSave }: { salary: FinanceSalaryRule | null; benefit: FinanceBenefitRule | null; accounts: FinanceAccount[]; onClose: () => void; onSave: (rules: { salary: Partial<FinanceSalaryRule>; benefit: Partial<FinanceBenefitRule> }) => Promise<void> }) {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const salaryAmount = parseMoney(String(data.get("salaryAmount") ?? "0"));
    const benefitAmount = parseMoney(String(data.get("benefitAmount") ?? "0"));
    const dayOfMonth = Number(data.get("dayOfMonth"));
    if (salaryAmount <= 0 || benefitAmount <= 0 || dayOfMonth < 1 || dayOfMonth > 31) { setError("Informe valores e dia válidos."); return; }
    try { await onSave({ salary: { amount: salaryAmount, dayOfMonth, account: String(data.get("salaryAccount")), scheduleMode: String(data.get("scheduleMode")) as FinanceSalaryRule["scheduleMode"], dateAdjustment: String(data.get("dateAdjustment")) as FinanceSalaryRule["dateAdjustment"], active: true }, benefit: { amount: benefitAmount, dayOfMonth, account: String(data.get("benefitAccount")), scheduleMode: String(data.get("scheduleMode")) as FinanceBenefitRule["scheduleMode"], dateAdjustment: String(data.get("dateAdjustment")) as FinanceBenefitRule["dateAdjustment"], active: true } }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); }
  }
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">Calendário financeiro</span><h2>Salário e Caju VA</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit}><label>Salário mensal<input name="salaryAmount" inputMode="decimal" defaultValue={formatInput(salary?.amount ?? 2200)} required /></label><label>Conta do salário<select name="salaryAccount" defaultValue={salary?.account ?? "Nubank"}>{accounts.map((account) => <option key={account.id}>{account.name}</option>)}</select></label><label>VA por dia útil<input name="benefitAmount" inputMode="decimal" defaultValue={formatInput(benefit?.amount ?? 25)} required /></label><label>Conta do VA<select name="benefitAccount" defaultValue={benefit?.account ?? "Caju VA"}>{accounts.map((account) => <option key={account.id}>{account.name}</option>)}</select></label><label>Regra da data<select name="scheduleMode" defaultValue={salary?.scheduleMode ?? "business-day-of-month"}><option value="business-day-of-month">Nº do dia útil do mês</option><option value="day-of-month">Dia fixo, ajustado se necessário</option></select></label><label>Dia / ordinal<input name="dayOfMonth" type="number" min="1" max="31" defaultValue={salary?.dayOfMonth ?? 5} required /></label><label className="wide">Se a data fixa não for útil<select name="dateAdjustment" defaultValue={salary?.dateAdjustment ?? "previous"}><option value="previous">Antecipar para o dia útil anterior</option><option value="next">Mover para o próximo dia útil</option></select></label><div className="calendar-preview wide"><CalendarDays size={18} /><span>O VA será calculado automaticamente: <strong>R$ 25,00 × dias úteis do mês</strong>. O crédito entra junto com o salário e continua previsto até você confirmar.</span></div>{error && <div className="import-error wide"><AlertTriangle size={17} />{error}</div>}<div className="modal-actions wide"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit">Salvar calendário</button></div></form></section></div>;
}

function CategoryModal({ categories, onClose, onSave }: { categories: FinanceCategory[]; onClose: () => void; onSave: (category: Omit<FinanceCategory, "id"> & { id?: string; originalName?: string }) => Promise<void> }) {
  const [selected, setSelected] = useState<FinanceCategory | null>(null); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name") || "").trim(); if (!name) return; try { await onSave({ id: selected?.id, originalName: selected?.name, name, kind: String(data.get("kind")) as FinanceCategory["kind"], color: String(data.get("color")), icon: "circle", essential: data.get("essential") === "on" }); setSelected(null); (event.currentTarget as HTMLFormElement).reset(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); } }
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal category-modal" role="dialog" aria-modal="true"><div className="modal-header"><div><span className="eyebrow">100% personalizáveis</span><h2>Categorias de entradas e saídas</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="category-manager"><div className="category-pill-list"><button className={!selected ? "active" : ""} onClick={() => setSelected(null)}><Plus size={15} /> Nova categoria</button>{categories.map((category) => <button key={category.id} className={selected?.id === category.id ? "active" : ""} onClick={() => setSelected(category)}><i className={category.kind} />{category.name}<small>{category.kind === "income" ? "Entrada" : category.essential ? "Saída · essencial" : "Saída · não essencial"}</small></button>)}</div><form key={selected?.id ?? "new"} onSubmit={submit}><label className="wide">Nome<input name="name" defaultValue={selected?.name ?? ""} placeholder="Ex.: Estética automotiva" autoFocus required /></label><label>Fluxo<select name="kind" defaultValue={selected?.kind ?? "expense"}><option value="expense">Saída / gasto</option><option value="income">Entrada / renda</option></select></label><label>Cor<select name="color" defaultValue={selected?.color ?? "teal"}><option value="teal">Verde-azulado</option><option value="green">Verde</option><option value="purple">Roxo</option><option value="orange">Laranja</option><option value="blue">Azul</option><option value="gray">Cinza</option></select></label><label className="checkbox-field wide"><input name="essential" type="checkbox" defaultChecked={selected?.essential ?? false} /><span><strong>Gasto essencial</strong><small>Usar esta categoria no cálculo da reserva de emergência</small></span></label>{error && <div className="import-error wide">{error}</div>}<div className="modal-actions wide"><button type="button" className="ghost-button" onClick={() => setSelected(null)}>Limpar</button><button className="primary-button" type="submit">{selected ? "Salvar alteração" : "Criar categoria"}</button></div></form></div></section></div>;
}

function AccountModal({ account, onClose, onSave, onDelete }: { account: FinanceAccount | null; onClose: () => void; onSave: (account: Omit<FinanceAccount, "id"> & { id?: string }) => Promise<void>; onDelete?: () => Promise<void> }) {
  const [error, setError] = useState(""); const [deleting, setDeleting] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const balance = parseMoney(String(data.get("balance") ?? "0")); const goal = parseMoney(String(data.get("goal") ?? "0")); const monthlyYieldPercent = parseMoney(String(data.get("monthlyYieldPercent") ?? "0")); const name = String(data.get("name") || "").trim(); if (!name || !Number.isFinite(balance) || !Number.isFinite(goal) || !Number.isFinite(monthlyYieldPercent)) { setError("Informe nome, saldo, meta e rentabilidade válidos."); return; } try { await onSave({ id: account?.id || undefined, name, institution: String(data.get("institution") || "manual"), kind: String(data.get("kind") || "checking"), balance, goal, monthlyYieldPercent, fixed: account?.fixed ?? false, color: account?.color ?? "teal" }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); } }
  async function remove() { if (!onDelete || deleting) return; setDeleting(true); setError(""); try { await onDelete(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível excluir esta conta."); } finally { setDeleting(false); } }
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal small"><div className="modal-header"><div><span className="eyebrow">Patrimônio e saldos</span><h2>{account?.id ? "Editar conta" : "Adicionar conta"}</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit}><label className="wide">Nome<input name="name" defaultValue={account?.name ?? ""} placeholder="Ex.: Reserva de emergência" readOnly={account?.fixed} required /></label><label>Tipo<select name="kind" defaultValue={account?.kind ?? "checking"}><option value="checking">Conta bancária</option><option value="benefit">Benefício / VA</option><option value="cash">Dinheiro</option><option value="investment">Investimento ou reserva</option></select></label><label>Instituição<input name="institution" defaultValue={account?.institution ?? "manual"} /></label><label className="wide">Saldo atual<input name="balance" inputMode="decimal" defaultValue={formatInput(account?.balance ?? 0)} required /></label><label>Meta desta conta / reserva<input name="goal" inputMode="decimal" defaultValue={formatInput(account?.goal ?? 0)} placeholder="0,00" /></label><label>Rentabilidade estimada ao mês (%)<input name="monthlyYieldPercent" inputMode="decimal" defaultValue={formatInput(account?.monthlyYieldPercent ?? 0)} placeholder="Ex.: 0,8" /></label><div className="calendar-preview wide"><TrendingUp size={17} /><span>O saldo estimado cresce pela taxa mensal informada. A conta fixa de reserva também compara sua meta com os gastos essenciais.</span></div>{error && <div className="import-error wide">{error}</div>}<div className="modal-actions wide">{onDelete && <button type="button" className="danger-button" disabled={deleting} onClick={() => void remove()}><Trash2 size={16} /> {deleting ? "Excluindo..." : "Excluir conta"}</button>}<span className="modal-spacer" /><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit">Salvar conta</button></div></form></section></div>;
}

function CardModal({ card, accounts, onClose, onSave }: { card: FinanceCard | null; accounts: FinanceAccount[]; onClose: () => void; onSave: (card: FinanceCard) => Promise<void> }) {
  const [kind, setKind] = useState<"credit" | "debit">(card?.kind ?? "credit"); const [imageData, setImageData] = useState(card?.imageData ?? ""); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name") || "").trim(); if (!name) return; try { await onSave({ id: card?.id ?? createId(), name, linkedAccount: String(data.get("linkedAccount")), kind, brand: String(data.get("brand")), tier: String(data.get("tier")), last4: String(data.get("last4")), limit: parseMoney(String(data.get("limit") || "0")), closingDay: Number(data.get("closingDay") || 1), dueDay: Number(data.get("dueDay") || 8), dueAdjustment: String(data.get("dueAdjustment")) as FinanceCard["dueAdjustment"], pointsPerDollar: Number(String(data.get("pointsPerDollar") || "0").replace(",", ".")), cashbackPercent: Number(String(data.get("cashbackPercent") || "0").replace(",", ".")), rewardMode: String(data.get("rewardMode")) as FinanceCard["rewardMode"], pointsGoal: Number(data.get("pointsGoal") || 0), manualUsdRate: parseMoney(String(data.get("manualUsdRate") || "0")), color: card?.color ?? (name.toLowerCase().includes("caju") ? "caju" : "custom"), imageData: imageData || undefined }); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); } }
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal card-modal"><div className="modal-header"><div><span className="eyebrow">Configuração livre</span><h2>{card ? `Editar ${card.name}` : "Novo cartão"}</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit}><label className="wide">Nome do cartão<input name="name" defaultValue={card?.name ?? ""} placeholder="Ex.: Nubank Ultravioleta" required /></label><div className="wide card-image-field"><span>Imagem do cartão</span><div>{imageData ? <NextImage src={imageData} alt="Prévia do cartão" width={254} height={160} unoptimized /> : <span className="card-image-placeholder"><CreditCard size={24} /> Use uma foto frontal, sem dados sensíveis</span>}<span className="card-image-actions"><label className="secondary-button"><Camera size={15} /> {imageData ? "Trocar imagem" : "Enviar imagem"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { setImageData(await cardDataFromFile(file)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Imagem inválida"); } }} /></label>{imageData && <button className="ghost-button" type="button" onClick={() => setImageData("")}>Remover</button>}</span></div><small>A imagem é reduzida antes do envio e fica visível também no Android.</small></div><label>Tipo<select value={kind} onChange={(event) => setKind(event.target.value as "credit" | "debit")}><option value="credit">Crédito / fatura</option><option value="debit">Débito no saldo</option></select></label><label>Conta vinculada<select name="linkedAccount" defaultValue={card?.linkedAccount ?? accounts[0]?.name}>{accounts.map((account) => <option key={account.id}>{account.name}</option>)}</select></label><label>Bandeira<input name="brand" defaultValue={card?.brand ?? "Mastercard"} /></label><label>Categoria do cartão<input name="tier" defaultValue={card?.tier ?? "Black"} /></label><label>Últimos 4 dígitos<input name="last4" inputMode="numeric" maxLength={4} defaultValue={card?.last4 ?? "0000"} /></label>{kind === "credit" && <><label>Limite atual, livre para editar<input name="limit" inputMode="decimal" defaultValue={formatInput(card?.limit ?? 0)} /></label><label>Dia de fechamento<input name="closingDay" type="number" min="1" max="31" defaultValue={card?.closingDay ?? 1} /></label><label>Dia de vencimento<input name="dueDay" type="number" min="1" max="31" defaultValue={card?.dueDay ?? 8} /></label><label className="wide">Se o vencimento não for útil<select name="dueAdjustment" defaultValue={card?.dueAdjustment ?? "next"}><option value="next">Próximo dia útil</option><option value="previous">Dia útil anterior</option></select></label><label>Pontos por dólar<input name="pointsPerDollar" inputMode="decimal" defaultValue={formatInput(card?.pointsPerDollar ?? 2.2)} /></label><label>Cashback percentual<input name="cashbackPercent" inputMode="decimal" defaultValue={formatInput(card?.cashbackPercent ?? 1.25)} /></label><label>Regra de recompensa<select name="rewardMode" defaultValue={card?.rewardMode ?? "both"}><option value="both">Pontos ou cashback</option><option value="points">Somente pontos</option><option value="cashback">Somente cashback</option><option value="none">Sem recompensa</option></select></label><label>Meta de pontos<input name="pointsGoal" type="number" min="0" defaultValue={card?.pointsGoal ?? 30000} /></label><label className="wide">Dólar manual de contingência<input name="manualUsdRate" inputMode="decimal" defaultValue={formatInput(card?.manualUsdRate ?? 0)} placeholder="Usado apenas se a PTAX não responder" /></label></>}{error && <div className="import-error wide">{error}</div>}<div className="modal-actions wide"><button type="button" className="ghost-button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit">Salvar cartão</button></div></form></section></div>;
}

function ImportModal({ accounts, cards, defaultInvoiceMonth, onClose, onReady }: { accounts: string[]; cards: FinanceCard[]; defaultInvoiceMonth: string; onClose: () => void; onReady: (items: FinanceTransaction[], name: string) => Promise<void> }) {
  const options = [...cards.map((card) => ({ label: card.name, account: card.linkedAccount, card })), ...accounts.filter((account) => !cards.some((card) => card.linkedAccount === account)).map((account) => ({ label: account, account, card: undefined }))];
  const [file, setFile] = useState<File | null>(null); const [selected, setSelected] = useState(options[0]?.label ?? "Nubank"); const [invoiceMonth, setInvoiceMonth] = useState(defaultInvoiceMonth); const [parsed, setParsed] = useState<FinanceTransaction[]>([]); const [ignored, setIgnored] = useState(0); const [ignoredReasons, setIgnoredReasons] = useState<string[]>([]); const [expandedInstallments, setExpandedInstallments] = useState(0); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const selectedOption = options.find((item) => item.label === selected) ?? options[0];
  const isCreditInvoice = selectedOption?.card?.kind === "credit";
  const competenceItems = isCreditInvoice ? parsed.filter((item) => item.invoiceMonth === invoiceMonth) : parsed;
  const importedTotal = competenceItems.reduce((sum, item) => sum + item.amount, 0);
  async function analyze(chosen: File | null, selectedLabel = selected, referenceMonth = invoiceMonth) { setFile(chosen); setParsed([]); setIgnored(0); setIgnoredReasons([]); setExpandedInstallments(0); setError(""); if (!chosen) return; const option = options.find((item) => item.label === selectedLabel) ?? options[0]; const extension = chosen.name.split(".").pop()?.toLowerCase(); if (extension === "pdf") { setError("Para corrigir o PDF sem perder o fim da fatura, preciso de uma amostra exportada pelo seu Nubank (pode ocultar nome e dados). CSV e OFX já usam o leitor completo nesta versão."); return; } try { const text = await chosen.text(); const result = extension === "ofx" ? parseOfx(text, option.account) : parseCsv(text, option.account, option.card, option.card?.kind === "credit" ? referenceMonth : undefined); if (!result.items.length) setError("Não encontrei compras válidas nas colunas de data, descrição e valor."); setParsed(result.items); setIgnored(result.ignored); setIgnoredReasons(result.ignoredReasons); setExpandedInstallments(result.expandedInstallments); } catch { setError("Não consegui ler o arquivo. Exporte uma nova cópia em CSV ou OFX."); } }
  async function commitImport() { if (!file || saving) return; setSaving(true); setError(""); try { await onReady(parsed, file.name); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar a importação."); } finally { setSaving(false); } }
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal import-modal"><div className="modal-header"><div><span className="eyebrow">Importação assistida</span><h2>Importar fatura ou extrato</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div><div className="import-settings"><label className="import-account">Destino<select value={selected} onChange={(event) => { setSelected(event.target.value); void analyze(file, event.target.value, invoiceMonth); }}>{options.map((item) => <option key={item.label}>{item.label}</option>)}</select></label>{isCreditInvoice && <label className="import-account">Mês da fatura<input type="month" value={invoiceMonth} onChange={(event) => { const nextMonth = event.target.value; setInvoiceMonth(nextMonth); void analyze(file, selected, nextMonth); }} /><small>Esta competência recebe somente a parcela indicada; as demais vão para seus meses corretos.</small></label>}</div><label className="dropzone"><FileUp size={28} /><strong>{file ? file.name : "Selecione seu arquivo"}</strong><span>CSV e OFX com revisão antes de salvar</span><input type="file" accept=".pdf,.ofx,.csv" onChange={(event) => void analyze(event.target.files?.[0] ?? null)} /></label>{error && <div className="import-error"><AlertTriangle size={17} />{error}</div>}{ignored > 0 && <div className="import-note"><Check size={16} /><span><strong>{ignored} linhas ignoradas corretamente</strong>{ignoredReasons.length ? `: ${ignoredReasons.join(", ")}.` : "."}</span></div>}{parsed.length > 0 && <div className="import-review"><div className="import-review-summary"><span><strong>{isCreditInvoice ? `${competenceItems.length} compras nesta fatura` : `${parsed.length} lançamentos encontrados`}</strong><small>{expandedInstallments ? `${expandedInstallments} parcelas anteriores ou futuras geradas · ${parsed.length} lançamentos no histórico completo` : "Leitura completa do arquivo · confira a amostra"}</small></span><span className="import-total"><small>{isCreditInvoice ? "Total desta competência" : "Total movimentado"}</small><strong>{brl.format(importedTotal)}</strong></span></div>{competenceItems.slice(0, 5).map((item) => <div className="import-row" key={item.id}><span><strong>{item.description}</strong><small>{shortDate(item.date)} · {item.installments ? `Parcela ${item.installments}` : item.type === "expense" ? "Saída" : "Entrada"}</small></span><strong>{brl.format(item.amount)}</strong></div>)}{competenceItems.length > 5 && <small className="import-more">+ {competenceItems.length - 5} lançamentos preservados após a amostra</small>}</div>}<div className="modal-actions"><button className="ghost-button" disabled={saving} onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving || !file || !parsed.length || (isCreditInvoice && !/^\d{4}-\d{2}$/.test(invoiceMonth))} onClick={() => void commitImport()}>{saving ? "Salvando..." : `Importar ${parsed.length || ""}`}</button></div></section></div>;
}
