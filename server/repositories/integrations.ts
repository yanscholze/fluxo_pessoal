import { and, eq, sql } from "drizzle-orm";

import { getDatabase } from "../db/client.ts";
import { integrationCredentials, integrationPreferences } from "../db/schema/index.ts";

export type IntegrationProvider = "gemini" | "openai" | "github";
export type AiProvider = "gemini" | "openai";

export async function savedProviders(userId: string): Promise<IntegrationProvider[]> {
  const rows = await getDatabase().select({ provider: integrationCredentials.provider })
    .from(integrationCredentials).where(eq(integrationCredentials.userId, userId));
  return rows.map((row) => row.provider);
}

export async function credentialRow(userId: string, provider: IntegrationProvider) {
  const [row] = await getDatabase().select({ nonce: integrationCredentials.nonce, ciphertext: integrationCredentials.ciphertext })
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.provider, provider)))
    .limit(1);
  return row ?? null;
}

export async function saveCredentialRow(userId: string, provider: IntegrationProvider, nonce: string, ciphertext: string): Promise<void> {
  await getDatabase().insert(integrationCredentials).values({ userId, provider, nonce, ciphertext })
    .onConflictDoUpdate({
      target: [integrationCredentials.userId, integrationCredentials.provider],
      set: { nonce, ciphertext, updatedAt: sql`CURRENT_TIMESTAMP` },
    });
}

export async function removeCredentialRow(userId: string, provider: IntegrationProvider): Promise<void> {
  await getDatabase().delete(integrationCredentials)
    .where(and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.provider, provider)));
}

export async function selectedAiProvider(userId: string): Promise<AiProvider | null> {
  const [row] = await getDatabase().select({ aiProvider: integrationPreferences.aiProvider })
    .from(integrationPreferences).where(eq(integrationPreferences.userId, userId)).limit(1);
  return row?.aiProvider ?? null;
}

export async function selectAiProvider(userId: string, aiProvider: AiProvider | null): Promise<void> {
  await getDatabase().insert(integrationPreferences).values({ userId, aiProvider })
    .onConflictDoUpdate({ target: integrationPreferences.userId, set: { aiProvider, updatedAt: sql`CURRENT_TIMESTAMP` } });
}
