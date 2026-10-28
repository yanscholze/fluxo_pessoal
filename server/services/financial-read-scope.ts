import { AsyncLocalStorage } from "node:async_hooks";

type ReadScope = { readonly loads: Map<string, Promise<unknown>>; active: boolean };
const scopes = new AsyncLocalStorage<ReadScope>();

/**
 * One explicit, read-only computation may reuse its database reads and mapping.
 * Nothing survives this operation or crosses requests. Do not wrap mutations:
 * a read after a write must start a new scope to observe the updated state.
 * Nested financial views share the caller's scope instead of loading again.
 */
export function withFinancialReadScope<T>(work: () => Promise<T>): Promise<T> {
  if (scopes.getStore()?.active) return work();
  const scope: ReadScope = { loads: new Map(), active: true };
  return scopes.run(scope, async () => {
    try { return await work(); }
    finally {
      scope.active = false;
      scope.loads.clear();
    }
  });
}

/** Store promises before starting reads so concurrent consumers share one load. */
export function memoFinancialRead<T>(key: string, load: () => Promise<T>): Promise<T> {
  const scope = scopes.getStore();
  if (!scope?.active) return load();
  const existing = scope.loads.get(key);
  if (existing) return existing as Promise<T>;
  const pending = Promise.resolve().then(load);
  scope.loads.set(key, pending);
  void pending.catch(() => {
    if (scope.loads.get(key) === pending) scope.loads.delete(key);
  });
  return pending;
}
