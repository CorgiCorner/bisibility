import { isTruthyFlag } from "./dispatcher-config";

export type DataForSeoQueuePriority = "high" | "normal";
export type QueuedRankCheckConfig = {
  enabled: boolean;
  invalidKeys: string[];
  maxQueueAgeSeconds: number;
  pollIntervalSeconds: number;
  priority: DataForSeoQueuePriority;
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

export function queuedRankCheckConfig(env: NodeJS.ProcessEnv = process.env): QueuedRankCheckConfig {
  const invalidKeys: string[] = [];
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
  if (pollIntervalSeconds === null) invalidKeys.push("DATAFORSEO_QUEUE_POLL_INTERVAL_SECONDS");
  if (maxQueueAgeSeconds === null) invalidKeys.push("DATAFORSEO_QUEUE_MAX_AGE_SECONDS");

  return {
    enabled: isTruthyFlag(env.DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED) && invalidKeys.length === 0,
    invalidKeys,
    maxQueueAgeSeconds: maxQueueAgeSeconds ?? defaults.maxQueueAgeSeconds,
    pollIntervalSeconds: pollIntervalSeconds ?? defaults.pollIntervalSeconds,
    priority: effectivePriority,
  };
}
