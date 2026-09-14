/**
 * Uma tela que lê do servidor.
 *
 * Toda tela online repetia a mesma dança: estado de carregando, estado de
 * offline, estado de erro, `useEffect` para disparar, `RefreshControl` para
 * repetir. Seis blocos idênticos em seis arquivos, e a sétima tela copiava a
 * sexta — inclusive os defeitos.
 *
 * A distinção que este gancho preserva é a que o cliente HTTP já faz e que é
 * fácil perder ao copiar: **não deu para falar com o servidor** é diferente de
 * **o servidor disse não**. A primeira é transitória e o usuário resolve
 * andando até onde pega sinal; a segunda é um problema que ele precisa ler.
 */

import { useCallback, useEffect, useState } from "react";

import { ApiError, OfflineError } from "../net/client.ts";
import { useConnectedSession } from "./session.tsx";

export type Remoto<T> = {
  readonly dados: T | null;
  readonly carregando: boolean;
  readonly offline: boolean;
  readonly erro: string | null;
  readonly recarregar: () => void;
};

export function useRemoto<T>(
  buscar: (credenciais: { baseUrl: string; token: string }) => Promise<T>,
  /**
   * O que muda a resposta além das credenciais — o período de um relatório, a
   * competência de um orçamento. Sem isto, trocar o filtro não recarregaria.
   */
  dependencias: readonly unknown[] = [],
): Remoto<T> {
  const { credentials } = useConnectedSession();

  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [offline, setOffline] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      setDados(await buscar({ baseUrl: credentials.baseUrl, token: credentials.token }));
      setOffline(false);
    } catch (problema) {
      if (problema instanceof OfflineError) {
        setOffline(true);
      } else {
        setErro(problema instanceof ApiError ? problema.message : "Não foi possível carregar.");
      }
    } finally {
      setCarregando(false);
    }
    // `buscar` costuma ser uma seta declarada no corpo da tela: incluí-la aqui
    // faria a dependência mudar a cada render e o efeito rodar sem parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials, ...dependencias]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { dados, carregando, offline, erro, recarregar: () => void carregar() };
}
