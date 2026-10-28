/** Bounded request diagnostics. Durations are wall time, NOT Worker CPU time. */
import { AsyncLocalStorage } from "node:async_hooks";

export type Stage = "auth" | "database" | "financial_context" | "ai" | "notifications" | "serialization";
type Metrics = { started: number; stages: Partial<Record<Stage, number>>; queries: number; route: string; method: string };
const scope = new AsyncLocalStorage<Metrics>();
const AREAS = new Set(["assistant", "session", "dashboard", "alerts", "transactions", "accounts", "cards", "categories", "invoices", "installments", "recurrences", "subscriptions", "budgets", "goals", "investments", "captures", "imports", "sync", "integrations", "receipts", "projects", "painel", "entrar", "lancamentos", "contas", "cartoes", "planejamento", "orcamentos", "patrimonio", "viagens", "relatorios", "projetos", "automaticos", "configuracoes"]);

/** Fixed area labels only: never log arbitrary path components or query strings. */
export function diagnosticRoute(pathname: string): string {
  if (pathname === "/") return "/";
  if (pathname === "/api/v1/assistant/analysis") return pathname;
  const parts = pathname.split("/").filter(Boolean);
  const api = parts[0] === "api" && parts[1] === "v1";
  const area = parts[api ? 2 : 0];
  return AREAS.has(area) ? `${api ? "/api/v1" : ""}/${area}${parts.length > (api ? 3 : 1) ? "/:item" : ""}` : "/other";
}

export function withRequestMetrics<T>(run: () => T, request?: Request): T {
  return scope.getStore() ? run() : scope.run({ started: performance.now(), stages: {}, queries: 0,
    route: request ? diagnosticRoute(new URL(request.url).pathname) : "/other",
    method: request && ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(request.method) ? request.method : "other" }, run);
}
export async function measureStage<T>(stage: Stage, run: () => Promise<T>): Promise<T> {
  const metrics = scope.getStore();
  if (!metrics) return run();
  const start = performance.now();
  try { return await run(); }
  finally { metrics.stages[stage] = (metrics.stages[stage] ?? 0) + performance.now() - start; }
}
export function measureSync<T>(stage: Stage, run: () => T): T {
  const metrics = scope.getStore();
  if (!metrics) return run();
  const start = performance.now();
  try { return run(); }
  finally { metrics.stages[stage] = (metrics.stages[stage] ?? 0) + performance.now() - start; }
}
export function metricsSnapshot() {
  const metrics = scope.getStore();
  return metrics ? { total: performance.now() - metrics.started, queries: metrics.queries, stages: { ...metrics.stages }, route: metrics.route, method: metrics.method } : null;
}
/** Headers expose aggregates only; no route parameters, SQL, bindings, user IDs or secrets. */
export function attachRequestMetrics(response: Response): Response {
  const metrics = metricsSnapshot();
  if (!metrics) return response;
  const headers = new Headers(response.headers);
  headers.set("server-timing", [...Object.entries(metrics.stages).map(([name, ms]) => `${name};dur=${ms.toFixed(2)}`), `total;dur=${metrics.total.toFixed(2)}`, `db_queries;desc="${metrics.queries}"`].join(", "));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Keep normal requests silent; one numeric-only event for slow/error requests. */
export function logRequestMetrics(status: number): void {
  const metrics = metricsSnapshot();
  if (!metrics || status < 500 && metrics.total < 1500) return;
  console.info("Fluxo performance", { status, route: metrics.route, method: metrics.method, totalMs: Math.round(metrics.total), queries: metrics.queries,
    stagesMs: Object.fromEntries(Object.entries(metrics.stages).map(([name, ms]) => [name, Math.round(ms)])) });
}

/** Instrument actual D1 execution without ever retaining SQL or parameter values. */
export function instrumentDatabase(binding: D1Database): D1Database {
  const original = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const execute = <T>(count: number, run: () => Promise<T>) => {
    const metrics = scope.getStore();
    if (metrics) metrics.queries += count;
    return measureStage("database", run);
  };
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const wrapper = {
      bind: (...values: unknown[]) => wrap(statement.bind(...values)),
      first: (column?: string) => execute(1, () => column === undefined ? statement.first() : statement.first(column)),
      run: () => execute(1, () => statement.run()),
      all: () => execute(1, () => statement.all()),
      raw: (options?: { columnNames?: boolean }) => execute(1, () => statement.raw(options)),
    } as D1PreparedStatement;
    original.set(wrapper, statement);
    return wrapper;
  };
  return {
    prepare: (query: string) => wrap(binding.prepare(query)),
    batch: (statements) => execute(statements.length, () => binding.batch(statements.map((s) => original.get(s) ?? s))),
    exec: (query: string) => execute(1, () => binding.exec(query)),
    dump: () => binding.dump(),
    withSession: (bookmark?: string) => instrumentDatabase(binding.withSession(bookmark)),
  };
}
