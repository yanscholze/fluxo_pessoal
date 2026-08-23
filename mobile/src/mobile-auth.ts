export type MobileAuthCallback = { token: string; gatewayToken: string; expiresAt: string; state: string };

export function parseMobileAuthCallback(url: string, expectedState: string): MobileAuthCallback {
  if (!url.startsWith("fluxo://auth")) throw new Error("Retorno de autorização inválido");
  const fragment = url.includes("#") ? url.slice(url.indexOf("#") + 1) : url.split("?")[1] ?? "";
  const values = new URLSearchParams(fragment);
  const state = values.get("state") ?? "";
  const token = values.get("token") ?? "";
  const gatewayToken = values.get("gateway") ?? "";
  const expiresAt = values.get("expires_at") ?? "";
  if (state !== expectedState) throw new Error("A autorização não pertence a esta tentativa");
  if (!/^[A-Za-z0-9_-]{24,160}$/.test(token) || !gatewayToken || !Number.isFinite(Date.parse(expiresAt))) throw new Error("A autorização recebida está incompleta");
  return { token, gatewayToken, expiresAt, state };
}
