/**
 * Estado da sessão do aparelho.
 *
 * Uma pergunta só: este aparelho está conectado a uma conta? Tudo que depende
 * dessa resposta — navegação, sincronização, captura de notificações — lê
 * daqui em vez de perguntar ao armazenamento seguro por conta própria.
 *
 * Conectar e desconectar têm efeitos além do estado em memória, e é de
 * propósito que eles moram juntos: desconectar sem apagar o banco local
 * deixaria o histórico de um dono visível para o próximo, e sem revogar as
 * credenciais do serviço nativo deixaria um serviço de sistema com um token
 * que já não deveria existir.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { wipeUserData } from "../storage/database.ts";
import {
  type Credentials,
  clearCredentials,
  deviceId as loadDeviceId,
  readCredentials,
  writeCredentials,
} from "../session/credentials.ts";
import { publishCredentials, revokeCredentials } from "../notifications/bridge.ts";

export type SessionState =
  | { readonly status: "carregando" }
  | { readonly status: "desconectado"; readonly deviceId: string }
  | { readonly status: "conectado"; readonly deviceId: string; readonly credentials: Credentials };

type SessionContextValue = {
  readonly state: SessionState;
  connect(credentials: Credentials): Promise<void>;
  disconnect(): Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "carregando" });

  useEffect(() => {
    let vivo = true;

    void (async () => {
      const [identificador, credenciais] = await Promise.all([loadDeviceId(), readCredentials()]);
      if (!vivo) return;

      if (credenciais) {
        // Reafirma as credenciais do serviço nativo a cada abertura: um
        // restore de backup pode trazer o aplicativo sem elas.
        await publishCredentials(credenciais.baseUrl, credenciais.token);
        setState({ status: "conectado", deviceId: identificador, credentials: credenciais });
      } else {
        setState({ status: "desconectado", deviceId: identificador });
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  const connect = useCallback(async (credentials: Credentials) => {
    await writeCredentials(credentials);
    await publishCredentials(credentials.baseUrl, credentials.token);
    const identificador = await loadDeviceId();
    setState({ status: "conectado", deviceId: identificador, credentials });
  }, []);

  const disconnect = useCallback(async () => {
    await revokeCredentials();
    await clearCredentials();
    await wipeUserData();
    const identificador = await loadDeviceId();
    setState({ status: "desconectado", deviceId: identificador });
  }, []);

  const value = useMemo(() => ({ state, connect, disconnect }), [state, connect, disconnect]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession precisa estar dentro de SessionProvider");
  return value;
}

/**
 * Sessão já conectada.
 *
 * Existe para as telas de dentro não precisarem tratar "e se não estiver
 * conectado?" a cada uso: a navegação garante que elas só montam conectado, e
 * o tipo passa a refletir isso.
 */
export function useConnectedSession(): { deviceId: string; credentials: Credentials } {
  const { state } = useSession();
  if (state.status !== "conectado") {
    throw new Error("Esta tela só existe com o aparelho conectado");
  }
  return { deviceId: state.deviceId, credentials: state.credentials };
}
