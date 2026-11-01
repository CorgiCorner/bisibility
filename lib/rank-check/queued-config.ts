import { isFalsyFlag, isTruthyFlag } from "./dispatcher-config";

export type DataForSeoQueuePriority = "high" | "normal";
export type QueuedRankCheckConfig = {
  enabled: boolean;
  invalidKeys: string[];
  maxQueueAgeSeconds: number;
  pollIntervalSeconds: number;
  priority: DataForSeoQueuePriority;
  taskGetFallbackSeconds: number;
};

const PRIORITY_DEFAULTS = {
  high: { maxQueueAgeSeconds: 900, pollIntervalSeconds: 15 },
  normal: { maxQueueAgeSeconds: 3600, pollIntervalSeconds: 60 },
} as const;

const PRIORITY_BOUNDS = {
  high: {
    maxQueueAgeSeconds: { max: 1800, min: 60 },
    pollIntervalSeconds: { max: 60, min: 5 },
  },
  normal: {
    maxQueueAgeSeconds: { max: 7200, min: 900 },
    pollIntervalSeconds: { max: 300, min: 30 },
  },
} as const;

function priority(raw: string | undefined) {
  const value = raw?.trim().toLowerCase() || "high";
  return value === "high" || value === "normal" ? value : null;
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  bounds: { max: number; min: number },
) {
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^[0-9]+$/.test(raw.trim())) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= bounds.min && value <= bounds.max ? value : null;
}

/** Unset or empty means on; only an explicit falsy flag turns the queued route off. */
function enabledFlag(raw: string | undefined) {
  if (raw === undefined || raw.trim() === "" || isTruthyFlag(raw)) return true;
  return isFalsyFlag(raw) ? false : null;
}

let invalidConfigWarned = false;

/** Warns once per process: an invalid queue setting turns the route off, which must be loud. */
export function warnInvalidQueuedRankCheckConfig(
  config: Pick<QueuedRankCheckConfig, "invalidKeys">,
  warn: (message: string, details: Record<string, unknown>) => void = console.warn,
) {
  if (invalidConfigWarned || config.invalidKeys.length === 0) return false;
  invalidConfigWarned = true;
  warn("[queued-rank-check] invalid queue configuration; the queued route is disabled", {
    invalidKeys: [...config.invalidKeys],
  });
  return true;
}

export function resetQueuedRankCheckConfigWarningForTests() {
  invalidConfigWarned = false;
}

export function queuedRankCheckConfig(env: NodeJS.ProcessEnv = process.env): QueuedRankCheckConfig {
  const invalidKeys: string[] = [];
  const enabled = enabledFlag(env.DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED);
  if (enabled === null) invalidKeys.push("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED");
  const parsedPriority = priority(env.DATAFORSEO_QUEUE_PRIORITY);
  if (!parsedPriority) invalidKeys.push("DATAFORSEO_QUEUE_PRIORITY");
  const effectivePriority = parsedPriority ?? "high";
  const defaults = PRIORITY_DEFAULTS[effectivePriority];
  const bounds = PRIORITY_BOUNDS[effectivePriority];
  const pollIntervalSeconds = boundedInteger(
    env.DATAFORSEO_QUEUE_POLL_INTERVAL_SECONDS,
    defaults.pollIntervalSeconds,
    bounds.pollIntervalSeconds,
  );
  const maxQueueAgeSeconds = boundedInteger(
    env.DATAFORSEO_QUEUE_MAX_AGE_SECONDS,
    defaults.maxQueueAgeSeconds,
    bounds.maxQueueAgeSeconds,
  );
  const taskGetFallbackSeconds = boundedInteger(
    env.DATAFORSEO_QUEUED_TASK_GET_FALLBACK_SECONDS,
    180,
    { min: 1, max: 7200 },
  );
  if (taskGetFallbackSeconds === null)
    invalidKeys.push("DATAFORSEO_QUEUED_TASK_GET_FALLBACK_SECONDS");
  if (pollIntervalSeconds === null) invalidKeys.push("DATAFORSEO_QUEUE_POLL_INTERVAL_SECONDS");
  if (maxQueueAgeSeconds === null) invalidKeys.push("DATAFORSEO_QUEUE_MAX_AGE_SECONDS");

  const config: QueuedRankCheckConfig = {
    enabled: enabled === true && invalidKeys.length === 0,
    invalidKeys,
    maxQueueAgeSeconds: maxQueueAgeSeconds ?? defaults.maxQueueAgeSeconds,
    pollIntervalSeconds: pollIntervalSeconds ?? defaults.pollIntervalSeconds,
    priority: effectivePriority,
    taskGetFallbackSeconds: taskGetFallbackSeconds ?? 180,
  };
  warnInvalidQueuedRankCheckConfig(config);
  return config;
}
