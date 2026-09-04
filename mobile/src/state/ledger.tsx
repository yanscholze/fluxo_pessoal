/**
 * Estado financeiro do aplicativo.
 *
 * Guarda o que veio do banco local e os números derivados dele. As telas leem
 * daqui e não tocam em SQLite nem em rede — a camada é `UI → estado →
 * serviços → domínio → persistência`, e pular um degrau é como a versão
 * anterior acabou com consulta de banco dentro de componente.
 *
 * A sincronização é sempre em segundo plano: nenhuma tela espera por ela. O
 * usuário registra o gasto, vê o gasto, e o servidor fica sabendo quando der.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AppState } from "react-native";

import { competenceOf } from "@fluxo/core/time/competence.ts";
import { todayIn } from "@fluxo/core/time/local-date.ts";
import { ApiError } from "../net/client.ts";
import { flushCaptures } from "../net/captures.ts";
import { type SyncOutcome, runSync } from "../net/sync.ts";
import {
  createTransaction,
  deleteTransaction,
  listAccounts,
  listCards,
  listCategories,
  listTransactions,
  updateTransaction,
} from "../storage/ledger.ts";
import type { LocalAccount, LocalCard, LocalCategory, LocalTransaction, TransactionDraft } from "../storage/model.ts";
import { type OutboxRow, countByStatus, discard, listUnresolved, rebase } from "../storage/outbox.ts";
import {
  type GastoPorCategoria,
  type Overview,
  type PontoMensal,
  balanceHistory,
  monthlyFlow,
  overview,
  spendByCategory,
} from "../finance/derive.ts";
import { appVersion, deviceName } from "../device.ts";

import { useSession } from "./session.tsx";

/** Quantos lançamentos ficam em memória. Cobre com folga o extrato do ano. */
const WINDOW = 500;

export type SyncStatus = {
  readonly running: boolean;
  readonly offline: boolean;
  readonly lastRunAt: string | null;
  readonly pending: number;
  readonly unresolved: number;
  readonly error: string | null;
};

type LedgerContextValue = {
  readonly loading: boolean;
  readonly transactions: readonly LocalTransaction[];
  readonly accounts: readonly LocalAccount[];
  readonly categories: readonly LocalCategory[];
  readonly cards: readonly LocalCard[];
  readonly overview: Overview | null;
  /** Séries do painel. Derivadas na leitura, como todo o resto. */
  readonly charts: {
    readonly monthly: readonly PontoMensal[];
    readonly byCategory: readonly GastoPorCategoria[];
    readonly balanceDays: readonly number[];
  };
  readonly sync: SyncStatus;
  readonly conflicts: readonly OutboxRow[];
  refresh(): Promise<void>;
  synchronize(): Promise<void>;
  create(draft: TransactionDraft): Promise<void>;
  update(current: LocalTransaction, draft: TransactionDraft): Promise<void>;
  remove(current: LocalTransaction): Promise<void>;
  resolveConflict(mutationId: string, decision: "reenviar" | "descartar", serverVersion: number): Promise<void>;
};

const LedgerContext = createContext<LedgerContextValue | null>(null);

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { state: session, disconnect } = useSession();
  const conectado = session.status === "conectado" ? session : null;

  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<LocalTransaction[]>([]);
  const [accounts, setAccounts] = useState<LocalAccount[]>([]);
  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [cards, setCards] = useState<LocalCard[]>([]);
  const [conflicts, setConflicts] = useState<OutboxRow[]>([]);
  const [sync, setSync] = useState<SyncStatus>({
    running: false,
    offline: false,
    lastRunAt: null,
    pending: 0,
    unresolved: 0,
    error: null,
  });

  // Impede dois ciclos concorrentes: o segundo enviaria de novo o que o
  // primeiro ainda está enviando, e ambos disputariam o cursor.
  const sincronizando = useRef(false);

  const refresh = useCallback(async () => {
    const [lancamentos, contas, categorias, cartoes, contagem, naoResolvidas] = await Promise.all([
      listTransactions({ limit: WINDOW }),
      listAccounts(),
      listCategories(),
      listCards(),
      countByStatus(),
      listUnresolved(),
    ]);

    setTransactions(lancamentos);
    setAccounts(contas);
    setCategories(categorias);
    setCards(cartoes);
    setConflicts(naoResolvidas);
    setSync((atual) => ({
      ...atual,
      pending: contagem.pending,
      unresolved: contagem.conflict + contagem.rejected,
    }));
    setLoading(false);
  }, []);

  const synchronize = useCallback(async () => {
    if (!conectado || sincronizando.current) return;
    sincronizando.current = true;
    setSync((atual) => ({ ...atual, running: true, error: null }));

    let resultado: SyncOutcome | null = null;
    let falha: string | null = null;

    try {
      resultado = await runSync({
        baseUrl: conectado.credentials.baseUrl,
        token: conectado.credentials.token,
        deviceId: conectado.deviceId,
        deviceName,
        appVersion,
        onUnauthenticated: () => {
          void disconnect();
        },
      });

      // As capturas sobem no mesmo ciclo: são a mesma janela de conectividade,
      // e uma tentativa separada só gastaria bateria de novo.
      await flushCaptures({
        baseUrl: conectado.credentials.baseUrl,
        token: conectado.credentials.token,
      }).catch(() => null);
    } catch (erro) {
      falha = erro instanceof ApiError ? erro.message : "Não foi possível sincronizar agora.";
    } finally {
      sincronizando.current = false;
    }

    await refresh();
    setSync((atual) => ({
      ...atual,
      running: false,
      offline: resultado?.offline ?? atual.offline,
      lastRunAt: resultado && !resultado.offline ? new Date().toISOString() : atual.lastRunAt,
      error: falha,
    }));
  }, [conectado, disconnect, refresh]);

  // Primeira carga e sincronização de abertura.
  useEffect(() => {
    if (!conectado) {
      setLoading(false);
      return;
    }
    void refresh().then(() => synchronize());
  }, [conectado, refresh, synchronize]);

  // Voltar do segundo plano é o momento mais provável de haver rede de novo.
  useEffect(() => {
    if (!conectado) return;
    const inscricao = AppState.addEventListener("change", (estado) => {
      if (estado === "active") void synchronize();
    });
    return () => inscricao.remove();
  }, [conectado, synchronize]);

  const create = useCallback(
    async (draft: TransactionDraft) => {
      const cartao = draft.cardId ? (cards.find((item) => item.id === draft.cardId) ?? null) : null;
      await createTransaction(draft, cartao);
      await refresh();
      void synchronize();
    },
    [cards, refresh, synchronize],
  );

  const update = useCallback(
    async (current: LocalTransaction, draft: TransactionDraft) => {
      const cartao = draft.cardId ? (cards.find((item) => item.id === draft.cardId) ?? null) : null;
      await updateTransaction(current, draft, cartao);
      await refresh();
      void synchronize();
    },
    [cards, refresh, synchronize],
  );

  const remove = useCallback(
    async (current: LocalTransaction) => {
      await deleteTransaction(current);
      await refresh();
      void synchronize();
    },
    [refresh, synchronize],
  );

  const resolveConflict = useCallback(
    async (mutationId: string, decision: "reenviar" | "descartar", serverVersion: number) => {
      if (decision === "reenviar") await rebase(mutationId, serverVersion);
      else await discard(mutationId);
      await refresh();
      void synchronize();
    },
    [refresh, synchronize],
  );

  const numeros = useMemo(() => {
    if (!conectado) return null;
    const hoje = todayIn();
    return overview({
      rows: transactions,
      accounts,
      cards,
      categories,
      userId: conectado.credentials.user.id,
      today: hoje,
      competence: competenceOf(hoje),
    });
  }, [conectado, transactions, accounts, cards, categories]);

  /**
   * As séries dos gráficos.
   *
   * Separadas do `overview` de propósito: são varreduras mais caras — seis
   * competências e trinta dias — e não precisam refazer quando só a sessão
   * muda. Memorizadas sobre os mesmos dados, recalculam junto com eles.
   */
  const charts = useMemo(() => {
    if (!conectado) return { monthly: [], byCategory: [], balanceDays: [] };

    const hoje = todayIn();
    const competencia = competenceOf(hoje);
    const userId = conectado.credentials.user.id;

    return {
      monthly: monthlyFlow({ rows: transactions, userId, competence: competencia, months: 6 }),
      byCategory: spendByCategory({ rows: transactions, categories, competence: competencia }),
      balanceDays: balanceHistory({ rows: transactions, accounts, userId, today: hoje, days: 30 }),
    };
  }, [conectado, transactions, accounts, categories]);

  const value = useMemo<LedgerContextValue>(
    () => ({
      loading,
      transactions,
      accounts,
      categories,
      cards,
      overview: numeros,
      charts,
      sync,
      conflicts,
      refresh,
      synchronize,
      create,
      update,
      remove,
      resolveConflict,
    }),
    [
      loading,
      transactions,
      accounts,
      categories,
      cards,
      numeros,
      charts,
      sync,
      conflicts,
      refresh,
      synchronize,
      create,
      update,
      remove,
      resolveConflict,
    ],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerContextValue {
  const value = useContext(LedgerContext);
  if (!value) throw new Error("useLedger precisa estar dentro de LedgerProvider");
  return value;
}
