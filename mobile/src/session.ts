import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";

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

async function authenticate(input: { action: "login" | "register"; email: string; password: string; displayName?: string }) {
  const deviceId = await getDeviceId();
  const deviceName = Device.deviceName || Device.modelName || "Android";
  const response = await fetch(`${API_ORIGIN}/api/v1/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...input,
      device: { deviceId, deviceName, appVersion: "0.4.5" },
    }),
  });
  const result = await response.json() as {
    error?: string;
    deviceToken?: string;
    gatewayToken?: string;
    expiresAt?: string;
    user?: { id: string; email: string; displayName: string };
  };
  if (!response.ok || !result.deviceToken || !result.expiresAt || !result.user) throw new Error(result.error || "Não foi possível entrar");

  await Promise.all([
    SecureStore.setItemAsync(keys.deviceToken, result.deviceToken),
    result.gatewayToken ? SecureStore.setItemAsync(keys.gatewayToken, result.gatewayToken) : SecureStore.deleteItemAsync(keys.gatewayToken),
    SecureStore.setItemAsync(keys.expiresAt, result.expiresAt),
    SecureStore.setItemAsync(keys.userId, result.user.id),
    SecureStore.setItemAsync(keys.email, result.user.email),
    SecureStore.setItemAsync(keys.displayName, result.user.displayName),
  ]);
  return { deviceId, deviceToken: result.deviceToken, gatewayToken: result.gatewayToken, expiresAt: result.expiresAt, user: result.user } satisfies MobileSession;
}

export function loginWithPassword(email: string, password: string) {
  return authenticate({ action: "login", email, password });
}

export function registerWithPassword(displayName: string, email: string, password: string) {
  return authenticate({ action: "register", displayName, email, password });
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
