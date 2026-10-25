/** Exercise the actual built Worker on an isolated ephemeral D1. Never loads project secrets. */
import assert from "node:assert/strict";
import { readdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare, Log, LogLevel } from "miniflare";

const output = fileURLToPath(new URL("../dist/server/", import.meta.url));
await access(`${output}/index.js`);
const chunks = (await readdir(output, { recursive: true })).filter((file) => file.endsWith(".js") && file !== "index.js");
// Explicit modules support vinext's dynamic imports. Calling the Worker directly avoids
// the Wrangler local assets-proxy scheduled-handler bug (workers-sdk issue #9882).
const runtime = new Miniflare({
  modules: ["index.js", ...chunks].map((file) => ({ type: "ESModule", path: `${output}/${file}` })),
  modulesRoot: output,
  compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "fluxo-ai-validation-ephemeral" },
  d1Persist: false,
  log: new Log(LogLevel.WARN),
});
try {
  const worker = await runtime.getWorker();
  async function request(path, body, token) {
    const response = await worker.fetch(`http://fluxo.validation/api/v1/${path}`, {
      method: body ? "POST" : "GET", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    assert.ok(response.ok, `${path}: ${response.status} ${result.error?.message ?? ""}`);
    return result.data;
  }
  const auth = await request("session", { action: "signup", kind: "device", email: "cron@fluxo.validation", displayName: "Validação descartável", password: "Somente-teste-isolado-2026" });
  const account = await request("accounts", { name: "Conta de teste", kind: "checking", openingBalance: 200000, openedOn: "2026-01-01" }, auth.token);
  const category = await request("categories", { name: "Categoria de teste", kind: "expense" }, auth.token);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  await request("transactions", { kind: "expense", state: "confirmed", description: "Teste descartável do cron", amount: 3000, occurredOn: day, accountId: account.id, categoryId: category.id }, auth.token);
  const before = await request("transactions", undefined, auth.token);
  assert.equal((await request("assistant", undefined, auth.token)).configured, false);
  const outcome = await worker.scheduled({ cron: "17 * * * *" });
  assert.equal(outcome.outcome, "ok");
  const state = await request("assistant", undefined, auth.token);
  assert.equal(state.analysis.state, "fallback"); assert.ok(state.analysis.generatedAt); assert.ok(state.insights.length > 0);
  assert.deepEqual(await request("transactions", undefined, auth.token), before);
  const db = await runtime.getD1Database("DB");
  assert.equal((await db.prepare("SELECT COUNT(*) AS total FROM ai_usage").first()).total, 0);
  console.log("Worker agendado: ok. Migrations, fatos e fallback validados; lançamentos inalterados; nenhuma chave ou chamada de IA.");
} finally { await runtime.dispose(); }
