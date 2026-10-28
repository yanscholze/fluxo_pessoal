/** Real built Worker + ephemeral D1 + local Gemini mock. No project secrets or external AI calls. */
import assert from "node:assert/strict";
import { readdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare, Response as MockResponse, Log, LogLevel } from "miniflare";

const output = fileURLToPath(new URL("../dist/server/", import.meta.url));
await access(`${output}/index.js`);
const chunks = (await readdir(output, { recursive: true })).filter((file) => file.endsWith(".js") && file !== "index.js");
let modelCalls = 0;
let online = true;
const runtime = new Miniflare({
  modules: ["index.js", ...chunks].map((file) => ({ type: "ESModule", path: `${output}/${file}` })),
  modulesRoot: output,
  compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "fluxo-critical-path-ephemeral" }, d1Persist: false,
  bindings: { INTEGRATION_ENCRYPTION_KEY: Buffer.from("0123456789abcdef0123456789abcdef").toString("base64") },
  assets: { directory: fileURLToPath(new URL("../dist/client/", import.meta.url)), binding: "ASSETS",
    routerConfig: { has_user_worker: true } },
  outboundService: async (request) => {
    assert.equal(new URL(request.url).hostname, "generativelanguage.googleapis.com", "Unexpected external request");
    modelCalls++;
    if (!online) return new MockResponse("offline simulation", { status: 401 });
    const input = await request.json();
    const text = input.contents.at(-1).parts[0].text;
    const value = text.startsWith("CONTEXTO_ATUAL")
      ? { answer: "Confira seus compromissos antes de assumir novas despesas.", summary: "Planejamento", actions: [], warnings: [] }
      : { insights: JSON.parse(text).evidence.slice(0, 1).map((item) => ({ key: item.key, explanation: "Reavalie o planejamento antes de assumir novos compromissos." })) };
    return MockResponse.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] });
  },
  log: new Log(LogLevel.WARN),
});
try {
  const worker = await runtime.getWorker();
  const entry = await worker.fetch("http://fluxo.validation/entrar");
  assert.equal(entry.status, 200);
  assert.match(await entry.text(), /<form[^>]*method="post"/u, "Native login fallback must never put credentials in a GET URL");
  async function request(path, body, token, method = body ? "POST" : "GET") {
    const response = await worker.fetch(`http://fluxo.validation/api/v1/${path}`, {
      method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    assert.ok(response.ok, `${path}: ${response.status} ${result.error?.message ?? ""}`);
    assert.ok(!JSON.stringify(result).includes("local-provider-placeholder"), "Credential in response");
    return { data: result.data, timing: response.headers.get("server-timing") };
  }
  const email = "critical-path@fluxo.validation";
  const password = "Somente-teste-isolado-2026";
  const auth = (await request("session", { action: "signup", kind: "device", email, password, displayName: "Validação CPU" })).data;
  const token = auth.token;
  const account = (await request("accounts", { name: "Conta descartável", kind: "checking", openingBalance: 200000, openedOn: "2026-01-01" }, token)).data;
  const category = (await request("categories", { name: "Categoria descartável", kind: "expense" }, token)).data;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const expense = { kind: "expense", state: "confirmed", description: "Teste descartável", amount: 3000, occurredOn: day, accountId: account.id, categoryId: category.id };
  await request("transactions", expense, token);
  await request("integrations", { provider: "gemini", token: "local-provider-placeholder" }, token);
  const first = await request("assistant", undefined, token);
  assert.equal(first.data.analysis.status, "empty");
  for (let i = 0; i < 3; i++) {
    await request("assistant", undefined, token);
    await request("alerts", undefined, token);
    await request("dashboard", undefined, token);
  }
  assert.equal(modelCalls, 0, "Opening pages must not call a provider");
  const ready = (await request("assistant/analysis", undefined, token, "POST")).data;
  assert.equal(ready.state, "ready");
  assert.equal(modelCalls, 1);
  for (let i = 0; i < 3; i++) await request("assistant/analysis", undefined, token, "POST");
  assert.equal(modelCalls, 1, "Identical context must not regenerate");
  await request("transactions", { ...expense, amount: 5000 }, token);
  const stale = (await request("assistant", undefined, token)).data;
  assert.equal(stale.analysis.stale, true);
  assert.deepEqual(stale.insights, ready.insights.slice(0, 3));
  online = false;
  const failure = (await request("assistant/analysis", undefined, token, "POST")).data;
  assert.equal(failure.status, "error");
  assert.deepEqual(failure.insights, ready.insights);
  const callsAfterFailure = modelCalls;
  await request("assistant/analysis", undefined, token, "POST");
  assert.equal(modelCalls, callsAfterFailure, "Failure cooldown must suppress retries");
  const login = (await request("session", { action: "signin", kind: "device", email, password })).data;
  assert.ok(login.token);
  await request("dashboard", undefined, login.token);
  await request("cards", undefined, login.token);
  const saved = await request("assistant", undefined, login.token);
  assert.deepEqual(saved.data.insights, ready.insights.slice(0, 3));
  assert.equal(modelCalls, callsAfterFailure, "Offline provider must not affect login/dashboard/reads");
  online = true;
  const beforeChat = modelCalls;
  await request("assistant", { question: "Como posso organizar meu ciclo?" }, token);
  assert.equal(modelCalls, beforeChat + 1, "Chat is an independent explicit provider call");
  const db = await runtime.getD1Database("DB");
  const before = (await db.prepare("SELECT COUNT(*) AS total FROM transactions").first()).total;
  assert.equal((await worker.scheduled({ cron: "*/5 * * * *" })).outcome, "ok");
  assert.equal((await db.prepare("SELECT COUNT(*) AS total FROM transactions").first()).total, before);
  assert.ok(saved.timing?.includes("db_queries"));
  console.log("Critical path validated: real Worker, isolated D1, login/dashboard offline, persisted/stale insight, cooldown, repeated reads, separate chat and cron. All AI responses mocked locally.");
  console.log("Assistant Server-Timing:", saved.timing);
  if (process.argv.includes("--serve")) {
    console.log(`Disposable UI validation server: ${await runtime.ready}`);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (command) => {
      const action = command.trim();
      if (action === "offline") online = false;
      if (action === "online") online = true;
      if (["online", "offline", "counts"].includes(action)) console.log("Mock provider:", { online, modelCalls });
    });
    await new Promise((resolve) => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
  }
} finally { await runtime.dispose(); }
