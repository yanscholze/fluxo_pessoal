/** Built Worker + ephemeral D1: subscription scheduling and manual settlement. */
import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare, Log, LogLevel } from "miniflare";

const output = fileURLToPath(new URL("../dist/server/", import.meta.url));
const chunks = (await readdir(output, { recursive: true })).filter((file) => file.endsWith(".js") && file !== "index.js");
const runtime = new Miniflare({
  modules: ["index.js", ...chunks].map((file) => ({ type: "ESModule", path: `${output}/${file}` })),
  modulesRoot: output, compatibilityDate: "2026-05-15", compatibilityFlags: ["nodejs_compat"],
  d1Databases: { DB: "fluxo-subscriptions-ephemeral" }, d1Persist: false,
  assets: { directory: fileURLToPath(new URL("../dist/client/", import.meta.url)), binding: "ASSETS", routerConfig: { has_user_worker: true } },
  outboundService: () => { throw new Error("Unexpected external request in subscription validation"); },
  log: new Log(LogLevel.WARN),
});
try {
  const worker = await runtime.getWorker();
  async function request(path, body, token, method = body ? "POST" : "GET") {
    const response = await worker.fetch(`http://fluxo.validation/api/v1/${path}`, {
      method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    assert.ok(response.ok, `${path}: ${response.status} ${result.error?.message ?? ""}`);
    return result.data;
  }
  const email = "subscriptions@fluxo.validation";
  const password = "Somente-teste-isolado-2026";
  const auth = await request("session", { action: "signup", kind: "device", email, password, displayName: "Assinaturas teste" });
  const token = auth.token;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const [year, month, day] = today.split("-").map(Number);
  const annualStart = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const account = await request("accounts", { name: "Conta teste", kind: "checking", openingBalance: 200000, openedOn: "2026-01-01" }, token);
  const card = await request("cards", { name: "Cartão teste", kind: "credit", paymentAccountId: account.id,
    closingDay: 13, dueDay: 20, closingAdjustment: "none", dueAdjustment: "next", limit: 900000, isPrimary: true }, token);
  const category = await request("categories", { name: "Serviços teste", kind: "expense" }, token);
  const label = await request("subscription-labels", { name: "Software teste" }, token);
  const subscription = { categoryId: category.id, labelId: label.id, scheduleDay: day, startsOn: today };
  await request("subscriptions", { ...subscription, description: "Editor teste mensal", cardId: card.id, amount: 1500 }, token);
  await request("subscriptions", { ...subscription, description: "Editor teste anual", cardId: card.id, amount: 12001,
    interval: "yearly", scheduleDay: 7, startsOn: annualStart }, token);
  const debit = await request("subscriptions", { ...subscription, description: "Serviço teste em conta", accountId: account.id, amount: 900 }, token);
  const report = await request("subscriptions", undefined, token);
  assert.equal(report.totals.monthlyCents, 3400);
  assert.equal(report.totals.yearlyCents, 40801);
  assert.equal(report.subscriptions.find((row) => row.interval === "yearly").startsOn, annualStart);
  assert.equal((await request("transactions", undefined, token)).length, 0, "Reads and registration cannot post charges");
  const before = await request("dashboard", undefined, token);
  assert.equal((await worker.scheduled({ cron: "*/5 * * * *" })).outcome, "ok");
  const after = await request("dashboard", undefined, token);
  const posted = await request("transactions", undefined, token);
  assert.equal(posted.length, 1, "Only the due card subscription posts automatically");
  assert.equal(posted[0].description, "Editor teste mensal");
  assert.equal(posted[0].occurredOn, today);
  assert.equal(posted[0].amountCents, 1500);
  assert.equal(after.freeToSpend.amountCents, before.freeToSpend.amountCents, "Projection is replaced, not counted twice");
  assert.equal(after.freeToSpend.liquidBalanceCents, before.freeToSpend.liquidBalanceCents, "Card charge does not debit cash");
  assert.equal((await worker.scheduled({ cron: "*/5 * * * *" })).outcome, "ok");
  assert.deepEqual(await request("transactions", undefined, token), posted, "Repeated cron does not duplicate charges");
  const settled = await request("recurrences/confirm", { recurrenceId: debit.id, competence: today.slice(0, 7), occurredOn: today }, token);
  assert.ok(settled.transactionId);
  assert.equal((await request("recurrences/confirm", { recurrenceId: debit.id, competence: today.slice(0, 7), occurredOn: today }, token)).alreadyConfirmed, true);
  assert.equal((await request("transactions", undefined, token)).length, 2);
  assert.equal((await request("accounts", undefined, token)).find((row) => row.id === account.id).balanceCents, 199100);
  console.log("Subscriptions validated: exact annual cents/month selection, read-only views, due fixed-day card charge, one invoice entry, stable free-to-spend, repeated cron and manual account settlement. Ephemeral data; no external provider.");
  if (process.argv.includes("--serve")) {
    await request("transactions", { kind: "expense", state: "confirmed", description: "Pagamento de teste para vincular",
      amount: 990, occurredOn: today, accountId: account.id, categoryId: category.id }, token);
    console.log(`Disposable subscription UI: ${await runtime.ready}`);
    await new Promise((resolve) => { process.once("SIGINT", resolve); process.once("SIGTERM", resolve); });
  }
} finally { await runtime.dispose(); }
