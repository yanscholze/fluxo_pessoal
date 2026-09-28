/** Credenciais pessoais: isoladas por usuário e cifradas antes de entrar no D1. */
import { env } from "cloudflare:workers";

import { DomainError, validationError } from "../../core/kernel/errors.ts";
import {
  credentialRow, removeCredentialRow, savedProviders, saveCredentialRow,
  selectedAiProvider, selectAiProvider, type AiProvider, type IntegrationProvider,
} from "../repositories/integrations.ts";

export type IntegrationStatus = {
  readonly activeAiProvider: AiProvider | null;
  readonly saved: Readonly<Record<IntegrationProvider, boolean>>;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesFromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function base64FromBytes(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptionKey(): Promise<CryptoKey> {
  const raw = env.INTEGRATION_ENCRYPTION_KEY;
  if (typeof raw !== "string" || !raw) {
    throw new DomainError("conflict", "O armazenamento seguro das integrações ainda não foi configurado no servidor.");
  }
  let bytes: Uint8Array;
  try {
    bytes = bytesFromBase64(raw);
  } catch {
    throw new DomainError("conflict", "A chave de armazenamento das integrações está inválida no servidor.");
  }
  if (bytes.length !== 32) {
    throw new DomainError("conflict", "A chave de armazenamento das integrações precisa ter 32 bytes.");
  }
  return crypto.subtle.importKey("raw", new Uint8Array(bytes), "AES-GCM", false, ["encrypt", "decrypt"]);
}

function aad(userId: string, provider: IntegrationProvider): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encoder.encode(`fluxo:v1:${userId}:${provider}`));
}

export async function integrationStatus(userId: string): Promise<IntegrationStatus> {
  const [providers, selected] = await Promise.all([savedProviders(userId), selectedAiProvider(userId)]);
  const saved = {
    gemini: providers.includes("gemini"),
    openai: providers.includes("openai"),
    github: providers.includes("github"),
  };
  const activeAiProvider = selected && saved[selected] ? selected : saved.gemini ? "gemini" : saved.openai ? "openai" : null;
  return { activeAiProvider, saved };
}

/** Devolve a chave só ao código do servidor; nenhuma rota a serializa. */
export async function integrationToken(userId: string, provider: IntegrationProvider): Promise<string | null> {
  const row = await credentialRow(userId, provider);
  if (!row) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(bytesFromBase64(row.nonce)), additionalData: aad(userId, provider) },
      await encryptionKey(),
      new Uint8Array(bytesFromBase64(row.ciphertext)),
    );
    return decoder.decode(plaintext);
  } catch {
    throw new DomainError("conflict", "Não foi possível abrir esta credencial. Confira a chave de armazenamento do servidor.");
  }
}

export async function saveIntegrationToken(userId: string, provider: IntegrationProvider, token: string): Promise<IntegrationStatus> {
  const trimmed = token.trim();
  if (trimmed.length < 8 || trimmed.length > 1000) {
    throw validationError("A chave precisa ter entre 8 e 1000 caracteres", [{ path: "token", message: "Chave inválida" }]);
  }
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: aad(userId, provider) },
    await encryptionKey(),
    encoder.encode(trimmed),
  );
  await saveCredentialRow(userId, provider, base64FromBytes(nonce), base64FromBytes(new Uint8Array(ciphertext)));
  if (provider !== "github") await selectAiProvider(userId, provider);
  return integrationStatus(userId);
}

export async function chooseAiProvider(userId: string, provider: AiProvider): Promise<IntegrationStatus> {
  if (!(await savedProviders(userId)).includes(provider)) {
    throw validationError("Cadastre a chave deste provedor antes de selecioná-lo", [{ path: "provider", message: "Chave ausente" }]);
  }
  await selectAiProvider(userId, provider);
  return integrationStatus(userId);
}

export async function removeIntegrationToken(userId: string, provider: IntegrationProvider): Promise<IntegrationStatus> {
  await removeCredentialRow(userId, provider);
  const status = await integrationStatus(userId);
  if (provider !== "github") await selectAiProvider(userId, status.activeAiProvider);
  return integrationStatus(userId);
}
