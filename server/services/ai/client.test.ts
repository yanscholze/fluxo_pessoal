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
  for (const name of ["GEMINI_API_KEY", "GEMINI_USER_ID", "GEMINI_MODEL"] as const) definirSegredo(name, undefined);
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
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(body.generationConfig.responseJsonSchema, entrada.schema);
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"Olá"}' }] } }] });
  };
  assert.deepEqual(await ask<{ answer: string }>(userId, entrada), { answer: "Olá" });
});

test("Gemini recua e usa modelo alternativo quando o preferido está sobrecarregado", async () => {
  await saveIntegrationToken(userId, "gemini", "chave-gemini-de-teste");
  const models: string[] = [];
  globalThis.fetch = async (url) => {
    models.push(String(url));
    return models.length < 3
      ? Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 })
      : Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"Olá"}' }] } }] });
  };
  assert.deepEqual(await ask<{ answer: string }>(userId, entrada), { answer: "Olá" });
  assert.match(models[0], /gemini-3\.8-flash/);
  assert.match(models[1], /gemini-3\.8-flash/);
  assert.match(models[2], /gemini-3\.6-flash/);
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

test("chave de ambiente exige escopo de conta e não vaza para o irmão", async () => {
  definirSegredo("GEMINI_API_KEY", "environment-test-secret");
  assert.equal(await isConfigured(userId), false);
  definirSegredo("GEMINI_USER_ID", userId);
  assert.equal(await isConfigured(userId), true);
  const sibling = (await signUp({ email: "irmao@teste.app", password: "senha-de-teste-123", displayName: "Irmão" })).user.id;
  assert.equal(await isConfigured(sibling), false);
  await assert.rejects(() => ask(sibling, entrada), /Configure sua chave/);
  globalThis.fetch = async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "environment-test-secret");
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"Ok"}' }] } }] });
  };
  assert.deepEqual(await ask(userId, entrada), { answer: "Ok" });
  await saveIntegrationToken(userId, "gemini", "personal-secret-preferred");
  globalThis.fetch = async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "personal-secret-preferred");
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"Pessoal"}' }] } }] });
  };
  assert.deepEqual(await ask(userId, entrada), { answer: "Pessoal" });
});

test("Gemini recebe histórico com papéis nativos e limite defensivo", async () => {
  await saveIntegrationToken(userId, "gemini", "chave-gemini-de-teste");
  definirSegredo("GEMINI_MODEL", "gemini-3.6-flash");
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /gemini-3\.6-flash/);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.contents.length, 13);
    assert.equal(body.contents[0].role, "user");
    assert.equal(body.contents[1].role, "model");
    assert.equal(body.contents[12].role, "user");
    return Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"Ok"}' }] } }] });
  };
  await ask(userId, { ...entrada, history: Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? "assistant" as const : "user" as const, content: `Mensagem ${i}` })) });
});

test("ausência, timeout, quota e JSON inválido são falhas locais", async () => {
  await assert.rejects(() => ask(userId, entrada), /Configure/);
  await saveIntegrationToken(userId, "gemini", "chave-gemini-de-teste");
  globalThis.fetch = async () => { throw new DOMException("test timeout", "TimeoutError"); };
  await assert.rejects(() => ask(userId, entrada), /demorou/);
  globalThis.fetch = async () => Response.json({}, { status: 429 });
  await assert.rejects(() => ask(userId, entrada), (error: unknown) => (error as { code?: string }).code === "rate_limited");
  globalThis.fetch = async () => Response.json({ candidates: [{ content: { parts: [{ text: "not JSON" }] } }] });
  await assert.rejects(() => ask(userId, entrada), /ilegível/);
  globalThis.fetch = async () => Response.json({ candidates: [] });
  await assert.rejects(() => ask(userId, entrada), /vazia/);
});

test("modelo removido tenta alternativa; corpo HTTP ilegível recebe erro amigável", async () => {
  await saveIntegrationToken(userId, "gemini", "chave-gemini-de-teste");
  const urls: string[] = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return urls.length === 1 ? Response.json({}, { status: 404 }) : Response.json({ candidates: [{ content: { parts: [{ text: '{"answer":"Ok"}' }] } }] });
  };
  assert.deepEqual(await ask(userId, entrada), { answer: "Ok" });
  assert.equal(urls.length, 2); assert.match(urls[1], /gemini-3\.6-flash/);
  globalThis.fetch = async () => new Response("<html>provider error</html>", { status: 200 });
  await assert.rejects(() => ask(userId, entrada), /ilegível/);
});
