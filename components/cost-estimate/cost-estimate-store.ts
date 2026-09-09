import { type CostEstimateData, costEstimateDataSchema } from "@/lib/cost-estimate/api-contract";

export type CostEstimateSnapshot =
  | { status: "loading" | "error"; data: null }
  | { status: "ready"; data: CostEstimateData };
const loading: CostEstimateSnapshot = { status: "loading", data: null };
const failed: CostEstimateSnapshot = { status: "error", data: null };
const cache = new Map<string, { data: CostEstimateData; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;
const DEBOUNCE_MS = 150;

export function createCostEstimateStore(url: string | null) {
  const cached = url ? cache.get(url) : undefined;
  let snapshot: CostEstimateSnapshot =
    cached && cached.expiresAt > Date.now() ? { status: "ready", data: cached.data } : loading;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  async function load() {
    if (!url) return;
    const request = new AbortController();
    controller = request;
    try {
      const response = await fetch(url, { signal: request.signal });
      if (!response.ok) throw new Error("Estimate unavailable");
      const payload: unknown = await response.json();
      const data = costEstimateDataSchema.parse((payload as { data?: unknown })?.data);
      if (request.signal.aborted || controller !== request) return;
      cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
      const oldest = cache.keys().next().value;
      if (cache.size > 50 && oldest) cache.delete(oldest);
      snapshot = { status: "ready", data };
    } catch {
      if (request.signal.aborted || controller !== request) return;
      snapshot = failed;
    } finally {
      if (!request.signal.aborted && controller === request) {
        controller = null;
        notify();
      }
    }
  }

  function start() {
    if (url && !timer && !controller)
      timer = setTimeout(() => {
        timer = undefined;
        void load();
      }, DEBOUNCE_MS);
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => loading,
    retry() {
      snapshot = loading;
      notify();
      start();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (snapshot.status === "loading") start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          clearTimeout(timer);
          timer = undefined;
          controller?.abort();
          controller = null;
        }
      };
    },
  };
}
