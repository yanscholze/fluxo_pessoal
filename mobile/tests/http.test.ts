import assert from "node:assert/strict";
import test from "node:test";
import { ApiResponseError, readApiResponse } from "../src/http.ts";

test("reconhece a tela de login do servidor como autorização expirada", async () => {
  const response = new Response("<!doctype html><title>Sign in required</title>", {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  await assert.rejects(() => readApiResponse(response), (error: unknown) => error instanceof ApiResponseError && error.code === "SITE_GATEWAY_REQUIRED");
});

test("continua lendo respostas JSON válidas da API", async () => {
  const response = new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  assert.deepEqual(await readApiResponse<{ ok: boolean }>(response), { ok: true });
});
