/**
 * Lado JS do listener de notificações.
 *
 * O módulo nativo (`NotificationBridgeModule.kt`) faz três coisas e só três:
 * dizer se a permissão está concedida, abrir a tela de Ajustes onde o usuário
 * concede, e guardar as credenciais que o serviço de sistema usa para falar
 * com o servidor.
 *
 * As credenciais precisam ser repassadas ao nativo porque o serviço roda com o
 * aplicativo **fechado** — ele não tem como perguntar ao JS qual é o token.
 * Toda troca de sessão precisa reescrevê-las aqui, e toda desconexão precisa
 * apagá-las: um serviço de sistema segurando o token do dono anterior é uma
 * forma silenciosa de vazamento.
 */

import { NativeModules, Platform } from "react-native";

type NotificationBridge = {
  isEnabled(): Promise<boolean>;
  openSettings(): void;
  setCredentials(baseUrl: string, deviceToken: string): Promise<boolean>;
  clearCredentials(): Promise<boolean>;
};

const bridge = (NativeModules as Record<string, unknown>).FluxoNotificationBridge as
  | NotificationBridge
  | undefined;

/**
 * Verdadeiro quando o módulo nativo está presente.
 *
 * No Expo Go ele não está — o plugin só entra no build de desenvolvimento ou
 * de produção. A tela precisa saber para explicar isso em vez de dar erro.
 */
export function isBridgeAvailable(): boolean {
  return Platform.OS === "android" && Boolean(bridge);
}

export async function isListenerEnabled(): Promise<boolean> {
  if (!bridge) return false;
  try {
    return await bridge.isEnabled();
  } catch {
    return false;
  }
}

export function openListenerSettings(): void {
  bridge?.openSettings();
}

export async function publishCredentials(baseUrl: string, token: string): Promise<void> {
  if (!bridge) return;
  try {
    await bridge.setCredentials(baseUrl, token);
  } catch {
    // Falhar aqui degrada a captura automática, não o aplicativo: o usuário
    // continua lançando à mão.
  }
}

export async function revokeCredentials(): Promise<void> {
  if (!bridge) return;
  try {
    await bridge.clearCredentials();
  } catch {
    // Idem.
  }
}
