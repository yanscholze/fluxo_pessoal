"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FinanceAccount,
  FinanceBenefitRule,
  FinanceCard,
  FinanceCategory,
  FinanceExchangeRate,
  FinanceRecurringRule,
  FinanceSalaryRule,
  FinanceSnapshot,
  FinanceTransaction,
} from "../lib/finance-types";

export type SyncStatus = "connecting" | "synced" | "saving" | "offline" | "error";

function readList(key: string): FinanceTransaction[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveList(key: string, value: FinanceTransaction[]) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function clearFinanceLocalData(ownerKey: string) {
  window.localStorage.removeItem(`fluxo-finance-cache-v3:${ownerKey}`);
  window.localStorage.removeItem(`fluxo-finance-queue-v3:${ownerKey}`);
}

function mergeById(primary: FinanceTransaction[], secondary: FinanceTransaction[]) {
  const merged = new Map<string, FinanceTransaction>();
  [...secondary, ...primary].forEach((item) => merged.set(item.id, item));
  return [...merged.values()].sort((a, b) => b.date.localeCompare(a.date));
}

async function postFinance<T>(body: unknown): Promise<T> {
  const response = await fetch("/api/finance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Não foi possível salvar os dados");
  }
  return response.json() as Promise<T>;
}

async function getSnapshot() {
  const response = await fetch("/api/finance", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("Falha ao carregar dados");
  return response.json() as Promise<FinanceSnapshot>;
}

export function useFinanceSync(ownerKey: string) {
  const cacheKey = `fluxo-finance-cache-v3:${ownerKey}`;
  const queueKey = `fluxo-finance-queue-v3:${ownerKey}`;
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [cards, setCards] = useState<FinanceCard[]>([]);
  const [salaryRule, setSalaryRule] = useState<FinanceSalaryRule | null>(null);
  const [benefitRule, setBenefitRule] = useState<FinanceBenefitRule | null>(null);
  const [recurringRules, setRecurringRules] = useState<FinanceRecurringRule[]>([]);
  const [exchangeRate, setExchangeRate] = useState<FinanceExchangeRate | null>(null);
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const transactionsRef = useRef(transactions);

  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);

  const applySnapshot = useCallback((snapshot: FinanceSnapshot, queued: FinanceTransaction[] = []) => {
    setAccounts(snapshot.accounts);
    setCategories(snapshot.categories);
    setCards([...snapshot.cards].sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "credit" ? -1 : 1));
    setSalaryRule(snapshot.salaryRule);
    setBenefitRule(snapshot.benefitRule);
    setRecurringRules(snapshot.recurringRules ?? []);
    const merged = mergeById(queued.map((item) => ({ ...item, pendingSync: true })), snapshot.transactions);
    setTransactions(merged);
    transactionsRef.current = merged;
    saveList(cacheKey, merged);
  }, [cacheKey]);

  const refreshSnapshot = useCallback(async () => {
    const snapshot = await getSnapshot();
    applySnapshot(snapshot, readList(queueKey));
    return snapshot;
  }, [applySnapshot, queueKey]);

  const markSynced = useCallback((ids: string[]) => {
    const queue = readList(queueKey).filter((item) => !ids.includes(item.id));
    saveList(queueKey, queue);
    setTransactions((current) => {
      const next = current.map((item) => ids.includes(item.id) ? { ...item, pendingSync: false } : item);
      transactionsRef.current = next;
      saveList(cacheKey, next);
      return next;
    });
  }, [cacheKey, queueKey]);

  const flushQueue = useCallback(async (strict = false) => {
    const queue = readList(queueKey);
    if (!queue.length) {
      setStatus(navigator.onLine ? "synced" : "offline");
      return navigator.onLine;
    }
    if (!navigator.onLine) {
      setStatus("offline");
      return false;
    }
    setStatus("saving");
    const saved: string[] = [];
    for (const item of queue) {
      try {
        await postFinance({ transaction: { ...item, pendingSync: undefined } });
        saved.push(item.id);
      } catch (error) {
        setStatus("error");
        if (strict) throw error;
        return false;
      }
    }
    if (saved.length) markSynced(saved);
    if (saved.length === queue.length) {
      await refreshSnapshot().catch(() => undefined);
      setStatus("synced");
      return true;
    }
    return false;
  }, [markSynced, queueKey, refreshSnapshot]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const cached = readList(cacheKey);
      const queued = readList(queueKey);
      if (cached.length || queued.length) {
        const local = mergeById(queued.map((item) => ({ ...item, pendingSync: true })), cached);
        if (!cancelled) {
          setTransactions(local);
          transactionsRef.current = local;
        }
      }
      try {
        const snapshot = await getSnapshot();
        if (cancelled) return;
        applySnapshot(snapshot, queued);
        setStatus(queued.length ? "saving" : "synced");
        if (queued.length) await flushQueue();
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }
    async function loadRate() {
      try {
        const response = await fetch("/api/exchange-rate", { headers: { accept: "application/json" } });
        if (response.ok && !cancelled) setExchangeRate(await response.json() as FinanceExchangeRate);
      } catch { /* usa a cotação manual do cartão */ }
    }
    const handleOnline = () => void flushQueue();
    const handleOffline = () => setStatus("offline");
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void hydrate();
    void loadRate();
    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [applySnapshot, cacheKey, flushQueue, queueKey]);

  const addTransactions = useCallback(async (items: FinanceTransaction[]) => {
    const existingByFingerprint = new Map(
      transactionsRef.current
        .filter((item) => item.source === "import" && item.fingerprint)
        .map((item) => [item.fingerprint!, item.id]),
    );
    const prepared = items.map((item) => {
      const existingId = item.source === "import" && item.fingerprint ? existingByFingerprint.get(item.fingerprint) : undefined;
      const preparedItem = { ...item, id: existingId ?? item.id, pendingSync: true };
      if (item.source === "import" && item.fingerprint) existingByFingerprint.set(item.fingerprint, preparedItem.id);
      return preparedItem;
    });
    const next = mergeById(prepared, transactionsRef.current);
    setTransactions(next);
    transactionsRef.current = next;
    saveList(cacheKey, next);
    saveList(queueKey, mergeById(prepared, readList(queueKey)));
    setStatus(navigator.onLine ? "saving" : "offline");
    return flushQueue(true);
  }, [cacheKey, flushQueue, queueKey]);

  const removeTransaction = useCallback(async (id: string) => {
    setStatus("saving");
    const response = await fetch(`/api/finance?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error("Não foi possível excluir o lançamento");
    const next = transactionsRef.current.filter((item) => item.id !== id);
    transactionsRef.current = next;
    setTransactions(next);
    saveList(cacheKey, next);
    await refreshSnapshot();
    setStatus("synced");
  }, [cacheKey, refreshSnapshot]);

  const saveAccount = useCallback(async (account: Omit<FinanceAccount, "id"> & { id?: string }) => {
    setStatus("saving");
    try {
      const payload = await postFinance<{ account: FinanceAccount }>({ account });
      setAccounts((current) => [...current.filter((item) => item.id !== payload.account.id), payload.account].sort((a, b) => a.name.localeCompare(b.name)));
      await refreshSnapshot();
      setStatus("synced");
      return payload.account;
    } catch (error) { setStatus("error"); throw error; }
  }, [refreshSnapshot]);

  const removeAccount = useCallback(async (id: string) => {
    setStatus("saving");
    const response = await fetch(`/api/finance?entity=account&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) { setStatus("error"); throw new Error(payload?.error || "Não foi possível excluir a conta"); }
    await refreshSnapshot();
    setStatus("synced");
  }, [refreshSnapshot]);

  const saveCategory = useCallback(async (category: Omit<FinanceCategory, "id"> & { id?: string; originalName?: string }) => {
    setStatus("saving");
    try {
      const payload = await postFinance<{ category: FinanceCategory }>({ category });
      setCategories((current) => [...current.filter((item) => item.id !== payload.category.id), payload.category].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)));
      if (category.originalName && category.originalName !== payload.category.name) {
        setTransactions((current) => current.map((item) => item.category === category.originalName ? { ...item, category: payload.category.name } : item));
      }
      await refreshSnapshot();
      setStatus("synced");
      return payload.category;
    } catch (error) { setStatus("error"); throw error; }
  }, [refreshSnapshot]);

  const saveCard = useCallback(async (card: FinanceCard) => {
    setStatus("saving");
    try {
      const payload = await postFinance<{ card: FinanceCard }>({ card });
      setCards((current) => [...current.filter((item) => item.id !== payload.card.id), payload.card].sort((a, b) => a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "credit" ? -1 : 1));
      await refreshSnapshot();
      setStatus("synced");
      return payload.card;
    } catch (error) { setStatus("error"); throw error; }
  }, [refreshSnapshot]);

  const saveIncomeRules = useCallback(async (rules: { salary: Partial<FinanceSalaryRule>; benefit: Partial<FinanceBenefitRule> }) => {
    setStatus("saving");
    try {
      const payload = await postFinance<{ salaryRule: FinanceSalaryRule; benefitRule: FinanceBenefitRule }>({ incomeRules: rules });
      setSalaryRule(payload.salaryRule);
      setBenefitRule(payload.benefitRule);
      setStatus("synced");
      return payload;
    } catch (error) { setStatus("error"); throw error; }
  }, []);

  const confirmSalary = useCallback(async (month: string) => {
    setStatus("saving");
    try {
      const payload = await postFinance<{ transactions: FinanceTransaction[]; salaryRule: FinanceSalaryRule; benefitRule: FinanceBenefitRule; balanceChanges: Array<{ account: string; amount: number }> }>({ confirmSalary: { month } });
      const next = mergeById(payload.transactions, transactionsRef.current);
      setTransactions(next);
      transactionsRef.current = next;
      saveList(cacheKey, next);
      setSalaryRule(payload.salaryRule);
      setBenefitRule(payload.benefitRule);
      setAccounts((current) => current.map((account) => {
        const change = payload.balanceChanges.find((item) => item.account === account.name)?.amount ?? 0;
        return change ? { ...account, balance: account.balance + change } : account;
      }));
      setStatus("synced");
      return payload.transactions;
    } catch (error) { setStatus("error"); throw error; }
  }, [cacheKey]);

  const saveRecurringRule = useCallback(async (rule: Omit<FinanceRecurringRule, "effectiveDate" | "businessDays" | "projectedAmount">) => {
    setStatus("saving");
    try {
      const payload = await postFinance<{ recurringRule: FinanceRecurringRule }>({ recurringRule: rule });
      setRecurringRules((current) => [...current.filter((item) => item.id !== payload.recurringRule.id), payload.recurringRule].sort((a, b) => a.dayOfMonth - b.dayOfMonth || a.description.localeCompare(b.description)));
      await refreshSnapshot(); setStatus("synced"); return payload.recurringRule;
    } catch (error) { setStatus("error"); throw error; }
  }, [refreshSnapshot]);

  const payInvoice = useCallback(async (payment: { cardId: string; invoiceMonth: string; sourceAccount: string; amount: number; date?: string }) => {
    setStatus("saving");
    try {
      const uniqueId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const payload = await postFinance<{ transaction: FinanceTransaction; remaining: number; balance: number }>({ payInvoice: { ...payment, id: `invoice-payment:${uniqueId}` } });
      const next = mergeById([payload.transaction], transactionsRef.current); transactionsRef.current = next; setTransactions(next); saveList(cacheKey, next);
      setAccounts((current) => current.map((account) => account.name === payment.sourceAccount ? { ...account, balance: payload.balance } : account));
      await refreshSnapshot();
      setStatus("synced"); return payload;
    } catch (error) { setStatus("error"); throw error; }
  }, [cacheKey, refreshSnapshot]);

  return {
    transactions, accounts, categories, cards, salaryRule, benefitRule, recurringRules, exchangeRate, status,
    addTransactions, removeTransaction, saveAccount, removeAccount, saveCategory, saveCard, saveIncomeRules,
    saveRecurringRule, payInvoice, confirmSalary, retrySync: flushQueue,
  };
}
