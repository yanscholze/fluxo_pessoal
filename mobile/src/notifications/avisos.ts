/**
 * Notificações de aviso.
 *
 * O aplicativo pergunta ao servidor o que há para dizer e entrega ao sistema.
 * **Nenhuma regra sobre o que é urgente mora aqui** — se morasse, o celular e
 * o site poderiam discordar sobre o mesmo dinheiro, que é exatamente o defeito
 * que o Fluxo já pagou caro para corrigir no livre para gastar.
 *
 * A memória do que já foi notificado é a peça que separa "avisar" de
 * "perseguir": a entrega lembra o identificador e a revisão de cada aviso,
 * isolados por usuário e servidor. O backend controla a identidade do evento
 * e incrementa a revisão na escalada. Capturas usam o episódio pendente, sem
 * criar uma nova chave a cada dia. A leitura é persistida no servidor e não
 * se confunde com esta memória local de entrega.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

import { call } from "../net/client.ts";
import type { Credentials } from "../session/credentials.ts";
import { deliveryKey, notificationScope, pendingDeliveries } from "./notification-state.ts";

export type Aviso = {
  readonly id: string;
  readonly key: string;
  readonly revision: number;
  readonly severity: "urgente" | "atencao" | "informativo";
  readonly title: string;
  readonly body: string;
  readonly screen: string;
  readonly category: "critical" | "attention" | "insight" | "opportunity" | "reminder";
  readonly priority: number;
  readonly href: string;
  readonly askPrompt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly readAt: string | null;
  readonly resolvedAt: string | null;
};

export type CentralDeAvisos = { readonly today: string; readonly alerts: readonly Aviso[]; readonly history: readonly Aviso[]; readonly unreadCount: number };

/** Canal Android dos avisos. Precisa existir antes da primeira notificação. */
const CANAL = "avisos";

/*
 * Sem isto, notificação com o aplicativo aberto não aparece.
 *
 * O comportamento padrão do expo-notifications é **engolir** a notificação
 * quando o app está em primeiro plano — e é justamente aí que este módulo
 * dispara, logo depois de buscar os avisos. Pior: a chave era gravada como
 * notificada mesmo assim, então o aviso ficava silenciado para sempre sem
 * nunca ter chegado.
 *
 * O registro fica no topo do módulo, e não dentro de uma função: precisa valer
 * antes de qualquer agendamento, e importar este módulo é o que o garante.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

/**
 * Memória pequena de entregas recentes, por usuário e servidor. Identificador
 * ULID + revisão mantém este valor compacto no SecureStore. As chaves mais
 * antigas saem primeiro; avisos lidos ou resolvidos continuam sendo filtrados
 * pelo estado persistente recebido da API, mesmo após essa rotação local.
 */
const MEMORIA = 40;

export async function buscarAvisos(credenciais: {
  baseUrl: string;
  token: string;
}): Promise<readonly Aviso[]> {
  const resposta = await buscarCentral(credenciais);
  return resposta.alerts;
}

export async function buscarCentral(credenciais: { baseUrl: string; token: string }): Promise<CentralDeAvisos> {
  const response = await call<CentralDeAvisos>("/api/v1/alerts", credenciais);
  return { ...response, history: response.history ?? [], unreadCount: response.unreadCount ?? response.alerts.filter((item) => !item.readAt && !item.resolvedAt).length };
}

export async function marcarAvisosLidos(credentials: { baseUrl: string; token: string }, ids: readonly string[] | "all"): Promise<CentralDeAvisos> {
  return call<CentralDeAvisos>("/api/v1/alerts", { ...credentials, method: "PATCH", body: ids === "all" ? { all: true } : { ids } });
}

async function chavesEntregues(credentials: Credentials): Promise<string[]> {
  const cru = await SecureStore.getItemAsync(notificationScope(credentials));
  if (!cru) return [];
  try {
    const valor: unknown = JSON.parse(cru);
    return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === "string") : [];
  } catch {
    // Valor corrompido é tratado como memória vazia: reavisar é chato, travar é pior.
    return [];
  }
}

/**
 * Pede a permissão do sistema.
 *
 * Devolve `false` sem insistir quando o usuário recusa. Um aplicativo que pede
 * de novo a cada abertura é desinstalado antes de avisar qualquer coisa.
 */
export async function pedirPermissao(): Promise<boolean> {
  const atual = await Notifications.getPermissionsAsync();
  if (atual.granted) return true;
  if (!atual.canAskAgain) return false;
  const pedido = await Notifications.requestPermissionsAsync();
  return pedido.granted;
}

/**
 * Cria o canal Android dos avisos.
 *
 * A partir do Android 8 toda notificação pertence a um canal, e uma enviada
 * para um canal inexistente não aparece. O `defaultChannel` declarado no
 * plugin só escreve a meta-data que o FCM usa — quem cria o canal de verdade é
 * esta chamada. No iOS ela não faz nada, e é isso mesmo.
 */
async function garantirCanal(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(CANAL, {
    name: "Avisos",
    importance: Notifications.AndroidImportance.DEFAULT,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  });
}

/**
 * Entrega os avisos novos ao sistema e devolve quantos foram.
 *
 * Dispara imediatamente, no canal explícito do Android: o alerta já é sobre agora, e agendar
 * para depois criaria uma fila que sobrevive ao problema que a originou.
 */
export async function notificarNovos(avisos: readonly Aviso[], credentials: Credentials, isActive: () => boolean = () => true): Promise<number> {
  if (!isActive()) return 0;
  const jaVistos = new Set(await chavesEntregues(credentials));
  const pendentes = pendingDeliveries(avisos, [...jaVistos]);
  if (pendentes.length === 0) return 0;

  if (!(await pedirPermissao())) return 0;
  if (!isActive()) return 0;
  await garantirCanal();

  /*
   * A chave só é lembrada se a notificação de fato saiu.
   *
   * Marcar antes de entregar troca "já avisei" por "já tentei": qualquer falha
   * — permissão revogada no meio, canal ausente, agendamento recusado — deixava
   * o aviso silenciado para sempre sem nunca ter chegado a ninguém.
   */
  const entregues: string[] = [];
  for (const aviso of pendentes) {
    if (!isActive()) break;
    try {
      const identifier = await Notifications.scheduleNotificationAsync({
        identifier: deliveryKey(aviso),
        content: {
          title: aviso.title,
          body: aviso.body,
          data: { screen: aviso.screen, notificationId: aviso.id, userId: credentials.user.id, baseUrl: credentials.baseUrl },
        },
        trigger: Platform.OS === "android" ? { channelId: CANAL } : null,
      });
      if (!isActive()) {
        await Notifications.dismissNotificationAsync(identifier).catch(() => undefined);
        break;
      }
      entregues.push(deliveryKey(aviso));
    } catch {
      // Segue para os próximos: um aviso que falhou tenta de novo na próxima
      // abertura, e não leva os outros junto.
    }
  }

  if (entregues.length === 0 || !isActive()) return 0;

  const memoria = [...jaVistos, ...entregues].slice(-MEMORIA);
  await SecureStore.setItemAsync(notificationScope(credentials), JSON.stringify(memoria));

  return entregues.length;
}

/** Esquece o que já foi notificado. Usado ao desconectar o aparelho. */
export async function limparMemoria(credentials: Credentials): Promise<void> {
  await SecureStore.deleteItemAsync(notificationScope(credentials));
  await Promise.all([
    Notifications.dismissAllNotificationsAsync().catch(() => undefined),
    Notifications.setBadgeCountAsync(0).catch(() => undefined),
  ]);
}
