export const MOBILE_CALLBACK_URL = "fluxo://auth";
export const MOBILE_SESSION_DAYS = 180;

export type MobileAuthorizationInput = {
  deviceId: string;
  deviceName: string;
  appVersion?: string;
  state: string;
};

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createMobileToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashMobileToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return base64Url(new Uint8Array(digest));
}

export function parseBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{32,160})$/.exec(authorization);
  return match?.[1] ?? null;
}

export function parseMobileAuthorizationInput(input: unknown): { ok: true; value: MobileAuthorizationInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Solicitação inválida" };
  const value = input as Record<string, unknown>;
  const deviceId = typeof value.deviceId === "string" ? value.deviceId.trim() : "";
  const deviceName = typeof value.deviceName === "string" ? value.deviceName.trim() : "";
  const state = typeof value.state === "string" ? value.state.trim() : "";
  const appVersion = typeof value.appVersion === "string" ? value.appVersion.trim() : "";

  if (!/^[A-Za-z0-9.:_-]{8,160}$/.test(deviceId)) return { ok: false, error: "Identificador do aparelho inválido" };
  if (deviceName.length < 2 || deviceName.length > 80) return { ok: false, error: "Nome do aparelho inválido" };
  if (!/^[A-Za-z0-9_-]{24,160}$/.test(state)) return { ok: false, error: "Estado de autorização inválido" };
  if (appVersion.length > 40) return { ok: false, error: "Versão do aplicativo inválida" };

  return { ok: true, value: { deviceId, deviceName, state, appVersion: appVersion || undefined } };
}

export function mobileSessionExpiry(now = new Date()) {
  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + MOBILE_SESSION_DAYS);
  return expiresAt.toISOString();
}

export function mobileCallbackUrl(values: { token: string; gatewayToken: string; state: string; expiresAt: string }) {
  const params = new URLSearchParams({
    token: values.token,
    gateway: values.gatewayToken,
    state: values.state,
    expires_at: values.expiresAt,
  });
  return `${MOBILE_CALLBACK_URL}#${params.toString()}`;
}
