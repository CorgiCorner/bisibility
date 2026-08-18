import "@/lib/deployment/runtime-env.generated";

export type OpsNotifyMode = "all" | "failures";

export type OpsConfig = {
  enabled: boolean;
  heartbeatCron: string;
  heartbeatTimezone: string;
  includeNames: boolean;
  notifyMode: OpsNotifyMode;
  throttleMinutes: number;
  webhookUrl: string | null;
};

const DEFAULT_HEARTBEAT_CRON = "0 8 * * *";
const DEFAULT_HEARTBEAT_TIMEZONE = "Etc/UTC";
const DEFAULT_THROTTLE_MINUTES = 60;

function envFlag(value: string | undefined, fallback: boolean) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function positiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getOpsConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): OpsConfig {
  const webhookUrl = env.OPS_SLACK_WEBHOOK_URL?.trim() || null;
  const requestedEnabled = envFlag(env.OPS_EVENTS_ENABLED, Boolean(webhookUrl));
  const isManagedCloud = env.DEPLOYMENT_MODE?.trim().toLowerCase() === "cloud";
  return {
    enabled: Boolean(webhookUrl) && requestedEnabled,
    heartbeatCron: env.OPS_HEARTBEAT_CRON?.trim() || DEFAULT_HEARTBEAT_CRON,
    heartbeatTimezone: env.OPS_HEARTBEAT_TZ?.trim() || DEFAULT_HEARTBEAT_TIMEZONE,
    includeNames: !isManagedCloud && envFlag(env.OPS_SLACK_INCLUDE_NAMES, false),
    notifyMode: env.OPS_NOTIFY_MODE?.trim().toLowerCase() === "all" ? "all" : "failures",
    throttleMinutes: positiveNumber(env.OPS_THROTTLE_MINUTES, DEFAULT_THROTTLE_MINUTES),
    webhookUrl,
  };
}

/** Call sites use this before constructing routine per-run success events. */
export function shouldNotifyOpsSuccess(config: OpsConfig = getOpsConfig()) {
  return config.enabled && config.notifyMode === "all";
}
