import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { zerar } from "../../testing/cenario.ts";
import { definirSegredo } from "../../testing/worker-env.ts";
import { signUp } from "../auth.ts";
import { chooseAiProvider, saveIntegrationToken } from "../integration-credentials.ts";
import { activeProvider, ask, isConfigured } from "./client.ts";

const fetchAnterior = globalThis.fetch;
let userId = "";
const entrada = {
  instructions: "Responda só com o JSON solicitado.",
  schemaName: "resultado",
  schema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"] },
  content: [{ type: "input_text" as const, text: "Oi" }],
};

beforeEach(async () => {
  zerar();
  definirSegredo("INTEGRATION_ENCRYPTION_KEY", btoa("0123456789abcdef0123456789abcdef"));
  userId = (await signUp({ email: "ia@teste.app", password: "senha-de-teste-123", displayName: "Teste IA" })).user.id;
});
afterEach(() => { globalThis.fetch = fetchAnterior; });

test("cada conta escolhe Gemini e envia schema estruturado", async () => {
  await saveIntegrationToken(userId, "gemini", "chave-gemini-de-teste");
  await saveIntegrationToken(userId, "openai", "chave-openai-de-teste");
  await chooseAiProvider(userId, "gemini");
  assert.equal(await activeProvider(userId), "Gemini");
  assert.equal(await isConfigured(userId), true);
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /generativelanguage\.googleapis\.com.*generateContent/);
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "chave-gemini-de-teste");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.systemInstruction.parts[0].text, entrada.instructions);
    assert.equal(body.contents[0].parts[0].text, "Oi");
    assert.deepEqual(body.generationConfig.responseFormat.text.schema, entrada.schema);
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"Olá"}' }] } }] });
  };
  assert.deepEqual(await ask<{ answer: string }>(userId, entrada), { answer: "Olá" });
});

test("envia foto ao Gemini como dados inline com MIME correto", async () => {
  await saveIntegrationToken(userId, "gemini", "chave-gemini-de-teste");
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.contents[0].parts[1], { inlineData: { mimeType: "image/png", data: "YWJj" } });
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"Foto"}' }] } }] });
  };
  assert.deepEqual(await ask<{ answer: string }>(userId, {
    ...entrada,
    content: [...entrada.content, { type: "input_image", image_url: "data:image/png;base64,YWJj" }],
  }), { answer: "Foto" });
});

test("OpenAI é usada quando selecionada nesta conta", async () => {
  await saveIntegrationToken(userId, "openai", "chave-openai-de-teste");
  assert.equal(await activeProvider(userId), "OpenAI");
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), "https://api.openai.com/v1/responses");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer chave-openai-de-teste");
    assert.equal(JSON.parse(String(init?.body)).store, false);
    return Response.json({ output_text: '{"answer":"Olá"}' });
  };
  assert.deepEqual(await ask<{ answer: string }>(userId, entrada), { answer: "Olá" });
});
