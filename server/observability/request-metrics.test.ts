import assert from "node:assert/strict";
import { test } from "node:test";
import { attachRequestMetrics, diagnosticRoute, instrumentDatabase, measureStage, metricsSnapshot, withRequestMetrics } from "./request-metrics.ts";

test("request metrics isolate concurrent requests and expose only aggregate timings", async () => {
  const snapshots = await Promise.all([1, 2].map((count) => withRequestMetrics(async () => {
    for (let i = 0; i < count; i++) await measureStage("auth", async () => Promise.resolve());
    const response = attachRequestMetrics(new Response("ok"));
    assert.match(response.headers.get("server-timing")!, /auth;dur=/);
    assert.match(response.headers.get("server-timing")!, /db_queries;desc="0"/);
    assert.deepEqual(Object.keys(metricsSnapshot()!.stages), ["auth"]);
    return metricsSnapshot();
  })));
  assert.equal(snapshots.length, 2);
  assert.equal(metricsSnapshot(), null);
  assert.equal(diagnosticRoute("/api/v1/accounts/private-id"), "/api/v1/accounts/:item");
  assert.equal(diagnosticRoute("/api/v1/assistant/analysis"), "/api/v1/assistant/analysis");
  assert.equal(diagnosticRoute("/private-value/private-data"), "/other");
});

test("D1 instrumentation counts batched statements once and never records SQL or values", async () => {
  const input: string[] = [];
  const statement = {
    bind: (...values: unknown[]) => { input.push(String(values[0])); return statement; },
    all: async () => ({ success: true, results: [{ total: 1 }], meta: {} }),
    run: async () => ({ success: true, results: [], meta: {} }),
  } as unknown as D1PreparedStatement;
  const db = instrumentDatabase({ prepare: () => statement,
    batch: async (items: D1PreparedStatement[]) => { assert.ok(items.every((item) => item === statement)); return Promise.all(items.map((item) => item.run())); },
  } as unknown as D1Database);
  await withRequestMetrics(async () => {
    await db.prepare("SELECT private_column FROM private_table").bind("private-value").all();
    await db.batch([db.prepare("INSERT private"), db.prepare("UPDATE private")]);
    const metrics = metricsSnapshot()!;
    assert.equal(metrics.queries, 3);
    assert.ok(metrics.stages.database! >= 0);
    assert.ok(!JSON.stringify(metrics).includes("private"));
  });
  assert.deepEqual(input, ["private-value"]);
});
