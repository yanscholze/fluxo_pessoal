import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { zerar } from "../testing/cenario.ts";
import { definirSegredo } from "../testing/worker-env.ts";
import { credentialRow } from "../repositories/integrations.ts";
import { signUp } from "./auth.ts";
import {
  chooseAiProvider, integrationStatus, integrationToken, removeIntegrationToken, saveIntegrationToken,
} from "./integration-credentials.ts";

beforeEach(() => {
  zerar();
  definirSegredo("INTEGRATION_ENCRYPTION_KEY", btoa("0123456789abcdef0123456789abcdef"));
});

test("Gemini e GitHub são cifrados e isolados por login", async () => {
  const owner = (await signUp({ email: "yan@teste.app", password: "senha-de-teste-123", displayName: "Yan" })).user.id;
  const sibling = (await signUp({ email: "irmao@teste.app", password: "senha-de-teste-123", displayName: "Irmão" })).user.id;

  await saveIntegrationToken(owner, "gemini", "gemini-chave-do-yan");
  await saveIntegrationToken(owner, "github", "github-token-do-yan");
  await saveIntegrationToken(sibling, "openai", "openai-chave-irmao");
  await saveIntegrationToken(sibling, "github", "github-token-irmao");

  assert.deepEqual(await integrationStatus(owner), {
    activeAiProvider: "gemini", saved: { gemini: true, openai: false, github: true },
  });
  assert.deepEqual(await integrationStatus(sibling), {
    activeAiProvider: "openai", saved: { gemini: false, openai: true, github: true },
  });
  assert.equal(await integrationToken(owner, "github"), "github-token-do-yan");
  assert.equal(await integrationToken(sibling, "github"), "github-token-irmao");
  assert.equal(await integrationToken(sibling, "gemini"), null);
  assert.ok(!(await credentialRow(owner, "github"))?.ciphertext.includes("github-token-do-yan"));

  await removeIntegrationToken(owner, "github");
  assert.equal(await integrationToken(owner, "github"), null);
  assert.equal(await integrationToken(sibling, "github"), "github-token-irmao");
});

test("cada login mantém sua seleção de provedor", async () => {
  const first = (await signUp({ email: "primeiro@teste.app", password: "senha-de-teste-123", displayName: "Primeiro" })).user.id;
  const second = (await signUp({ email: "segundo@teste.app", password: "senha-de-teste-123", displayName: "Segundo" })).user.id;
  await saveIntegrationToken(first, "gemini", "gemini-chave-primeiro");
  await saveIntegrationToken(first, "openai", "openai-chave-primeiro");
  await saveIntegrationToken(second, "openai", "openai-chave-segundo");
  await chooseAiProvider(first, "gemini");
  assert.equal((await integrationStatus(first)).activeAiProvider, "gemini");
  assert.equal((await integrationStatus(second)).activeAiProvider, "openai");
});
