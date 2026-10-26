import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";

import { buscarCentral, marcarAvisosLidos, notificarNovos, type CentralDeAvisos } from "../notifications/avisos.ts";
import { useConnectedSession } from "./session.tsx";

type CentralState = {
  readonly data: CentralDeAvisos | null;
  readonly unreadCount: number;
  readonly loading: boolean;
  readonly error: string | null;
  refresh(): Promise<void>;
  markRead(ids: readonly string[] | "all"): Promise<void>;
};
const AvisosContext = createContext<CentralState | null>(null);

/** Polling só com o aplicativo ativo. Nenhum cálculo financeiro ou chamada Gemini. */
export function AvisosProvider({ children }: { children: ReactNode }) {
  const { credentials } = useConnectedSession();
  const [data, setData] = useState<CentralDeAvisos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const requestVersion = useRef(0);
  const mounted = useRef(true);
  const latestCredentials = useRef(credentials);
  latestCredentials.current = credentials;

  const accept = useCallback((value: CentralDeAvisos) => {
    setData(value);
    setError(null);
    void Notifications.setBadgeCountAsync(value.unreadCount).catch(() => undefined);
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current || AppState.currentState !== "active") return;
    inFlight.current = true;
    const version = ++requestVersion.current;
    const current = credentials;
    try {
      const value = await buscarCentral(current);
      if (!mounted.current || latestCredentials.current !== current || requestVersion.current !== version) return;
      accept(value);
      // Falha de permissão/canal não derruba a central e nunca marca como lido.
      await notificarNovos(value.alerts, current, () => mounted.current && latestCredentials.current === current && requestVersion.current === version).catch(() => 0);
      if (mounted.current && requestVersion.current === version) {
        void Notifications.setBadgeCountAsync(value.unreadCount).catch(() => undefined);
      }
    } catch {
      if (mounted.current && latestCredentials.current === current) setError("Não foi possível atualizar os avisos. Tente novamente quando houver conexão.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [credentials, accept]);

  const markRead = useCallback(async (ids: readonly string[] | "all") => {
    const current = credentials;
    const version = ++requestVersion.current;
    const value = await marcarAvisosLidos(current, ids);
    if (mounted.current && latestCredentials.current === current && requestVersion.current === version) accept(value);
  }, [credentials, accept]);

  useEffect(() => {
    mounted.current = true;
    setData(null);
    setLoading(true);
    void refresh();
    const interval = setInterval(() => void refresh(), 120_000);
    const listener = AppState.addEventListener("change", (state) => { if (state === "active") void refresh(); });
    return () => { mounted.current = false; clearInterval(interval); listener.remove(); };
  }, [refresh]);

  return <AvisosContext.Provider value={{ data, unreadCount: data?.unreadCount ?? 0, loading, error, refresh, markRead }}>{children}</AvisosContext.Provider>;
}

export function useAvisos(): CentralState {
  const value = useContext(AvisosContext);
  if (!value) throw new Error("AvisosProvider precisa envolver a navegação.");
  return value;
}

/** Toque em uma notificação é uma interação explícita; abrir a central não é. */
export function useAvisosNavigation(onOpen: (screen: string, notificationId?: string) => void) {
  const { credentials } = useConnectedSession();
  const { markRead } = useAvisos();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response || handled.current === response.notification.request.identifier) return;
      const data = response.notification.request.content.data ?? {};
      if (data.userId !== credentials.user.id || data.baseUrl !== credentials.baseUrl || typeof data.screen !== "string") return;
      handled.current = response.notification.request.identifier;
      const id = typeof data.notificationId === "string" ? data.notificationId : undefined;
      if (id) void markRead([id]).catch(() => undefined);
      onOpen(data.screen === "faturas" ? "cartoes" : data.screen, id);
    };
    const listener = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    return () => listener.remove();
  }, [credentials, markRead, onOpen]);
}
