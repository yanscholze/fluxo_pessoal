import { NativeModules, Platform } from "react-native";

type NativeBridge = {
  isEnabled(): Promise<boolean>;
  openSettings(): void;
  setCredentials(baseUrl: string, deviceToken: string): Promise<boolean>;
  clearCredentials(): Promise<boolean>;
};

const bridge: NativeBridge | null = Platform.OS === "android" ? (NativeModules.FluxoNotificationBridge as NativeBridge | undefined) ?? null : null;

/** true quando o módulo nativo está presente (compilado com o config plugin), mesmo sem o acesso ainda concedido. */
export function isNotificationBridgeAvailable() {
  return bridge != null;
}

/** true quando o usuário já liberou "Acesso a notificações" para o Fluxo em Ajustes do Android. */
export async function isNotificationAccessEnabled(): Promise<boolean> {
  if (!bridge) return false;
  try { return await bridge.isEnabled(); } catch { return false; }
}

/** Abre a tela do sistema onde o usuário libera o acesso — não existe diálogo de permissão padrão para isso. */
export function openNotificationAccessSettings() {
  bridge?.openSettings();
}

/** Chamado após login/pareamento bem-sucedido, para o serviço nativo poder encaminhar notificações mesmo com o app fechado. */
export async function syncNotificationBridgeCredentials(baseUrl: string, deviceToken: string) {
  if (!bridge) return;
  try { await bridge.setCredentials(baseUrl, deviceToken); } catch { /* melhor esforço */ }
}

/** Chamado no logout, para o serviço nativo parar de encaminhar notificações. */
export async function clearNotificationBridgeCredentials() {
  if (!bridge) return;
  try { await bridge.clearCredentials(); } catch { /* melhor esforço */ }
}
