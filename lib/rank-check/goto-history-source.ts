import { dataForSeoOrganicDecision } from "@/lib/providers/serp/dataforseo-payload";
import {
  isRedirectRow,
  type RedirectTransport,
  resolveRedirectRows,
  unresolvedRows,
} from "@/lib/providers/serp/redirect-resolution";
import type { SerpDepth } from "@/lib/serp/constants";

const PAID_PATHS = ["/task_post", "/tasks_ready"];
const guardedFetches = new WeakSet<typeof fetch>();

function requestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Free task_get and the redirect converter only. Paid submission never leaves this process. */
export function guardedGotoFetch(fetchImpl: typeof fetch): typeof fetch {
  if (guardedFetches.has(fetchImpl)) throw new Error("Historical fetch is already guarded.");
  const guarded: typeof fetch = async (input, init) => {
    const url = requestUrl(input);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (
      PAID_PATHS.some((path) => url.includes(path)) ||
      (url.includes("/task_get/") && method !== "GET")
    ) {
      throw new Error("Historical GoTo repair cannot submit or list paid tasks.");
    }
    return fetchImpl(input, init);
  };
  guardedFetches.add(guarded);
  return guarded;
}

export async function withGuardedFetch<T>(fetchImpl: typeof fetch, run: () => Promise<T>) {
  const previous = globalThis.fetch;
  if (guardedFetches.has(previous)) throw new Error("Historical fetch is already guarded.");
  globalThis.fetch = guardedGotoFetch(fetchImpl);
  try {
    return await run();
  } finally {
    globalThis.fetch = previous;
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function sourceTask(
  body: unknown,
  remaining = 4,
): {
  id: unknown;
  status: unknown;
  results: unknown;
  resultCount?: unknown;
  topStatus?: unknown;
  classification?: unknown;
  recoveryCompleteness?: unknown;
  retained: boolean;
} | null {
  const envelope = object(body);
  if (!envelope || remaining === 0) return null;
  if (Array.isArray(envelope.tasks)) {
    const task = envelope.tasks.length === 1 ? object(envelope.tasks[0]) : null;
    return task
      ? {
          id: task.id,
          status: task.status_code,
          results: task.result,
          resultCount: task.result_count,
          topStatus: envelope.status_code,
          retained: false,
        }
      : null;
  }
  if (envelope.data) return sourceTask(envelope.data, remaining - 1);
  const task = object(envelope.task);
  return task
    ? {
        id: task.id,
        status: object(task.status)?.code,
        results: task.results,
        classification: task.classification,
        recoveryCompleteness: object(object(envelope.raw)?.recovery)?.completeness,
        retained: true,
      }
    : null;
}

function resultRows(results: unknown, resultCount: unknown): unknown[] | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  if (resultCount !== undefined && resultCount !== results.length) return null;
  const rows: unknown[] = [];
  for (const value of results) {
    const result = object(value);
    if (!result || !Array.isArray(result.items)) return null;
    if (result.items_count !== undefined && result.items_count !== result.items.length) return null;
    rows.push(...result.items);
  }
  return rows;
}

export async function decideGotoHistoryBody(input: {
  body: unknown;
  depth: SerpDepth;
  domain: string;
  expectedTaskId: string | null;
  transport: RedirectTransport;
}) {
  const invalid = (reason: "source_identity" | "source_status" | "source_incomplete") => ({
    complete: false as const,
    decision: null,
    reason,
    resolution: null,
  });
  const task = sourceTask(input.body);
  if (!task || !input.expectedTaskId || task.id !== input.expectedTaskId)
    return invalid("source_identity");
  if (
    (!task.retained && task.topStatus !== 20000) ||
    (task.status !== 20000 && task.status !== 40102)
  )
    return invalid("source_status");
  if (
    task.retained &&
    (task.classification !== (task.status === 40102 ? "terminal_empty_success" : "success") ||
      task.recoveryCompleteness === "partial")
  )
    return invalid("source_incomplete");
  // Only the provider's terminal-empty code proves success without native result objects.
  const explicitEmpty =
    task.status === 40102 &&
    (task.results == null || (Array.isArray(task.results) && task.results.length === 0)) &&
    (task.resultCount === undefined || task.resultCount === 0);
  const rows = explicitEmpty ? [] : resultRows(task.results, task.resultCount);
  if (!rows || (task.status === 40102 && rows.length > 0)) return invalid("source_incomplete");
  const resolution = rows.some(isRedirectRow)
    ? await resolveRedirectRows(rows, input.transport)
    : unresolvedRows(rows);
  if (resolution.failed)
    return {
      complete: false as const,
      decision: null,
      reason: "conversion_failed" as const,
      resolution,
    };
  const decision = dataForSeoOrganicDecision(resolution.candidates, input.domain, input.depth);
  const complete = decision.outcome !== "indeterminate";
  return { complete, decision, reason: complete ? null : ("indeterminate" as const), resolution };
}
