import { API_ORIGIN, getSession } from "./session";
import { readApiResponse } from "./http";
import type { FinancialCoachResult, NotificationsResult, ProfileResult, ReceiptScanResult, SyncMutation, SyncResponse } from "./types";

function authenticatedHeaders(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) throw new Error("AUTH_REQUIRED");
  return {
    "content-type": "application/json",
    "authorization": `Bearer ${session.deviceToken}`,
    ...(session.gatewayToken ? { "OAI-Sites-Authorization": `Bearer ${session.gatewayToken}` } : {}),
  };
}

export async function syncApi(deviceId: string, mutations: SyncMutation[]): Promise<SyncResponse> {
  const session = await getSession();
  if (!session) throw new Error("AUTH_REQUIRED");
  const response = await fetch(`${API_ORIGIN}/api/v1/sync`, {
    method: "POST",
    headers: authenticatedHeaders(session),
    body: JSON.stringify({
      device: { id: deviceId, name: "Fluxo Android", platform: "android", appVersion: "0.3.0" },
      mutations,
    }),
  });
  const data = await readApiResponse<SyncResponse & { error?: string; code?: string }>(response);
  if (!response.ok) throw new Error(data.code || data.error || "SYNC_FAILED");
  return data;
}

export async function financeApi<T>(body: unknown): Promise<T> {
  const session = await getSession();
  if (!session) throw new Error("AUTH_REQUIRED");
  const response = await fetch(`${API_ORIGIN}/api/v1/finance`, {
    method: "POST",
    headers: authenticatedHeaders(session),
    body: JSON.stringify(body),
  });
  const data = await readApiResponse<T & { error?: string }>(response);
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação");
  return data;
}

export async function scanReceiptApi(input: { imageBase64: string; mimeType: string; categories: string[] }) {
  const session = await getSession();
  if (!session) throw new Error("AUTH_REQUIRED");
  const response = await fetch(`${API_ORIGIN}/api/v1/receipt/scan`, {
    method: "POST",
    headers: authenticatedHeaders(session),
    body: JSON.stringify(input),
  });
  const data = await readApiResponse<{ receipt?: ReceiptScanResult; error?: string }>(response);
  if (!response.ok || !data.receipt) throw new Error(data.error || "Não consegui ler este cupom");
  return data.receipt;
}

export async function financialCoachApi(question: string, period?: string) {
  const session = await getSession();
  if (!session) throw new Error("AUTH_REQUIRED");
  const response = await fetch(`${API_ORIGIN}/api/v1/ai/advice`, {
    method: "POST",
    headers: authenticatedHeaders(session),
    body: JSON.stringify({ question, period }),
  });
  const data = await readApiResponse<{ advice?: FinancialCoachResult; period?: string; error?: string }>(response);
  if (!response.ok || !data.advice) throw new Error(data.error || "Não consegui gerar esta análise");
  return { advice: data.advice, period: data.period };
}

export async function profileApi(payload?: Record<string, unknown>) {
  const session = await getSession();
  if (!session) throw new Error("AUTH_REQUIRED");
  const response = await fetch(`${API_ORIGIN}/api/v1/profile`, {
    method: payload ? "POST" : "GET",
    headers: authenticatedHeaders(session),
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const data = await readApiResponse<ProfileResult & { error?: string; requiresLogin?: boolean }>(response);
  if (!response.ok) throw new Error(data.error || "Não consegui atualizar o perfil");
  return data;
}

export async function notificationsApi(payload?: Record<string, unknown>) {
  const session = await getSession();
  if (!session) throw new Error("AUTH_REQUIRED");
  const response = await fetch(`${API_ORIGIN}/api/v1/notifications`, {
    method: payload ? "POST" : "GET",
    headers: authenticatedHeaders(session),
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const data = await readApiResponse<NotificationsResult & { error?: string }>(response);
  if (!response.ok) throw new Error(data.error || "Não consegui atualizar as notificações");
  return data;
}
