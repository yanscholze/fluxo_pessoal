import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { readApiResponse } from "./http";
import { parseMobileAuthCallback } from "./mobile-auth";

const API_ORIGIN = "https://fluxo-pessoal.yan-scholze.chatgpt.site";
const keys = {
  deviceId: "fluxo.device-id",
  deviceToken: "fluxo.device-token",
  gatewayToken: "fluxo.gateway-token",
  expiresAt: "fluxo.session-expires-at",
  userId: "fluxo.user-id",
  email: "fluxo.user-email",
  displayName: "fluxo.user-display-name",
};

export type MobileSession = {
  deviceId: string;
  deviceToken: string;
  gatewayToken?: string;
  expiresAt: string;
  user: { id: string; email: string; displayName: string; avatarData?: string | null };
};

async function getDeviceId() {
  const stored = await SecureStore.getItemAsync(keys.deviceId);
  if (stored) return stored;
  const created = Crypto.randomUUID();
  await SecureStore.setItemAsync(keys.deviceId, created);
  return created;
}

export async function getSession(): Promise<MobileSession | null> {
  const [deviceId, deviceToken, gatewayToken, expiresAt, userId, email, displayName] = await Promise.all([
    getDeviceId(),
    SecureStore.getItemAsync(keys.deviceToken),
    SecureStore.getItemAsync(keys.gatewayToken),
    SecureStore.getItemAsync(keys.expiresAt),
    SecureStore.getItemAsync(keys.userId),
    SecureStore.getItemAsync(keys.email),
    SecureStore.getItemAsync(keys.displayName),
  ]);
  if (!deviceToken || !expiresAt || !userId || !email || !displayName || Date.parse(expiresAt) <= Date.now()) return null;
  return { deviceId, deviceToken, gatewayToken: gatewayToken || undefined, expiresAt, user: { id: userId, email, displayName } };
}

function gatewayHeaders(deviceToken: string, gatewayToken: string) {
  return {
    "content-type": "application/json",
    "authorization": `Bearer ${deviceToken}`,
    "OAI-Sites-Authorization": `Bearer ${gatewayToken}`,
  };
}

export async function connectWithBrowser() {
  const deviceId = await getDeviceId();
  const deviceName = Device.deviceName || Device.modelName || "Android";
  const state = `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replace(/-/g, "");
  const query = new URLSearchParams({ device_id: deviceId, device_name: deviceName, app_version: "0.4.2", state });
  const result = await WebBrowser.openAuthSessionAsync(`${API_ORIGIN}/conectar-android?${query}`, "fluxo://auth");
  if (result.type !== "success" || !result.url) throw new Error(result.type === "cancel" ? "Conexão cancelada" : "Não foi possível concluir a conexão");
  const callback = parseMobileAuthCallback(result.url, state);
  const response = await fetch(`${API_ORIGIN}/api/v1/profile`, {
    headers: gatewayHeaders(callback.token, callback.gatewayToken),
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) throw new Error("O servidor não concluiu a conexão segura. Tente novamente.");
  const profile = await readApiResponse<{ error?: string; user?: { id: string; email: string; displayName: string; avatarData?: string | null } }>(response);
  if (!response.ok || !profile.user) throw new Error(profile.error || "Não foi possível identificar sua conta");

  await Promise.all([
    SecureStore.setItemAsync(keys.deviceToken, callback.token),
    SecureStore.setItemAsync(keys.gatewayToken, callback.gatewayToken),
    SecureStore.setItemAsync(keys.expiresAt, callback.expiresAt),
    SecureStore.setItemAsync(keys.userId, profile.user.id),
    SecureStore.setItemAsync(keys.email, profile.user.email),
    SecureStore.setItemAsync(keys.displayName, profile.user.displayName),
  ]);
  return { deviceId, deviceToken: callback.token, gatewayToken: callback.gatewayToken, expiresAt: callback.expiresAt, user: profile.user } satisfies MobileSession;
}

export async function logoutSession() {
  const session = await getSession();
  if (session) {
    await fetch(`${API_ORIGIN}/api/v1/auth`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${session.deviceToken}`,
        ...(session.gatewayToken ? { "OAI-Sites-Authorization": `Bearer ${session.gatewayToken}` } : {}),
      },
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => undefined);
  }
  await clearSession();
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(keys.deviceToken),
    SecureStore.deleteItemAsync(keys.gatewayToken),
    SecureStore.deleteItemAsync(keys.expiresAt),
    SecureStore.deleteItemAsync(keys.userId),
    SecureStore.deleteItemAsync(keys.email),
    SecureStore.deleteItemAsync(keys.displayName),
  ]);
}

export async function updateStoredUser(user: { id: string; email: string; displayName: string; avatarData?: string | null }) {
  await Promise.all([
    SecureStore.setItemAsync(keys.userId, user.id),
    SecureStore.setItemAsync(keys.email, user.email),
    SecureStore.setItemAsync(keys.displayName, user.displayName),
  ]);
}

export { API_ORIGIN };
