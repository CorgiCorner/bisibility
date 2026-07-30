import type { OpsConfig } from "@/lib/ops/config";
import { appRootPath } from "@/lib/routing/app-path";

export type OpsSeverity = "error" | "info" | "warning";

export type OpsEventInput = {
  dedupeKey?: string;
  fields?: Record<string, unknown>;
  kind: string;
  severity: OpsSeverity;
  title: string;
};

export type SanitizedOpsEvent = Omit<OpsEventInput, "fields"> & {
  fields?: Record<string, string>;
};

const MAX_TITLE_LENGTH = 500;
const MAX_FIELD_NAME_LENGTH = 120;
const MAX_FIELD_VALUE_LENGTH = 500;
const MAX_FIELDS = 10;
const MAX_FOOTER_LENGTH = 500;
const MAX_ERROR_LENGTH = 500;
const WEBHOOK_TIMEOUT_MS = 5_000;

const SECRET_ASSIGNMENT =
  /\b(api[-_ ]?key|authorization|bearer|client[-_ ]?secret|credential|password|private[-_ ]?key|refresh[-_ ]?token|secret|token|webhook[-_ ]?url)\b(\s*[:=]\s*|\s+)([^\s,;]+)/gi;
const ENV_SECRET_ASSIGNMENT =
  /\b([A-Z][A-Z0-9_]*(?:API_KEY|ACCESS_KEY|PASSWORD|PRIVATE_KEY|SECRET|TOKEN))\b(\s*[:=]\s*)([^\s,;]+)/g;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const SLACK_TOKEN = /\bxox[a-z]-[A-Za-z0-9-]+/gi;
const AWS_ACCESS_KEY = /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const SLACK_WEBHOOK = /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/gi;
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;
const URL_WITH_QUERY = /https?:\/\/[^\s<>"']+/gi;

function cap(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1))}…`;
}

function stripUrlQuery(raw: string) {
  const trailing = raw.match(/[),.;!?]+$/)?.[0] ?? "";
  const candidate = trailing ? raw.slice(0, -trailing.length) : raw;
  try {
    const url = new URL(candidate);
    url.search = "";
    url.hash = "";
    return `${url.toString()}${trailing}`;
  } catch {
    return raw;
  }
}

export function redactOpsText(value: unknown, limit = MAX_ERROR_LENGTH) {
  const text = value instanceof Error ? value.message : String(value ?? "");
  return cap(
    text
      .replace(SLACK_WEBHOOK, "[REDACTED]")
      .replace(URL_CREDENTIALS, "$1[REDACTED]@")
      .replace(URL_WITH_QUERY, stripUrlQuery)
      .replace(
        ENV_SECRET_ASSIGNMENT,
        (_match, label: string, separator: string) => `${label}${separator}[REDACTED]`,
      )
      .replace(
        SECRET_ASSIGNMENT,
        (_match, label: string, separator: string) => `${label}${separator}[REDACTED]`,
      )
      .replace(BEARER_TOKEN, "Bearer [REDACTED]")
      .replace(SLACK_TOKEN, "[REDACTED]")
      .replace(AWS_ACCESS_KEY, "[REDACTED]")
      .replace(JWT, "[REDACTED]"),
    limit,
  );
}

export function sanitizeOpsEvent(event: OpsEventInput): SanitizedOpsEvent {
  const fieldEntries = Object.entries(event.fields ?? {})
    .slice(0, MAX_FIELDS)
    .map(([name, value]) => [
      redactOpsText(name, MAX_FIELD_NAME_LENGTH),
      redactOpsText(value, MAX_FIELD_VALUE_LENGTH),
    ]);
  return {
    dedupeKey: event.dedupeKey,
    fields: fieldEntries.length ? Object.fromEntries(fieldEntries) : undefined,
    kind: cap(event.kind.trim() || "ops_event", 120),
    severity: event.severity,
    title: redactOpsText(event.title, MAX_TITLE_LENGTH),
  };
}

function escapeMrkdwn(value: string) {
  // This is the complete escaping required for Slack mrkdwn text fields.
  // nosemgrep: javascript.audit.detect-replaceall-sanitization.detect-replaceall-sanitization
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function severityEmoji(severity: OpsSeverity) {
  if (severity === "error") return "❌";
  if (severity === "warning") return "⚠️";
  return "ℹ️";
}

function deploymentEnvironment() {
  return (
    process.env.DEPLOYMENT_ENV?.trim() ||
    process.env.BISIBILITY_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "unknown"
  );
}

function releaseVersion() {
  const release =
    process.env.APP_VERSION?.trim() || process.env.SENTRY_RELEASE?.trim() || "unknown";
  return release.length === 40 && /^[0-9a-f]+$/i.test(release) ? release.slice(0, 12) : release;
}

function instanceUrl() {
  const configured = process.env.SITE_URL?.trim();
  if (!configured) return "unconfigured";
  try {
    const url = new URL(configured);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "invalid";
  }
}

function heartbeatLinks(kind: string) {
  if (kind !== "heartbeat") return "";
  const site = instanceUrl();
  const temporal = process.env.TEMPORAL_UI_URL?.trim();
  const safeTemporal = temporal ? redactOpsText(temporal, MAX_FOOTER_LENGTH) : null;
  const links = [
    site !== "unconfigured" && site !== "invalid" ? `${site}${appRootPath()}` : null,
    safeTemporal,
  ]
    .filter(Boolean)
    .join(" · ");
  return links ? ` · Links: ${links}` : "";
}

export function formatOpsSlackPayload(input: OpsEventInput) {
  const event = sanitizeOpsEvent(input);
  const title = `${severityEmoji(event.severity)} ${escapeMrkdwn(event.title)}`;
  const fields = Object.entries(event.fields ?? {}).map(([name, value]) => ({
    type: "mrkdwn" as const,
    text: `*${escapeMrkdwn(name)}*\n${escapeMrkdwn(value)}`,
  }));
  const footer = cap(
    `Environment: ${deploymentEnvironment()} · Release: ${releaseVersion()} · Instance: ${instanceUrl()}${heartbeatLinks(event.kind)}`,
    MAX_FOOTER_LENGTH,
  );
  return {
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${title}*` } },
      ...(fields.length ? [{ type: "section", fields }] : []),
      { type: "context", elements: [{ type: "mrkdwn", text: escapeMrkdwn(footer) }] },
    ],
    text: `${severityEmoji(event.severity)} ${event.title}`,
    unfurl_links: false,
    unfurl_media: false,
  };
}

export async function postOpsSlackWebhook(config: OpsConfig, event: OpsEventInput) {
  if (!config.webhookUrl) throw new Error("Ops Slack webhook is not configured.");
  const response = await fetch(config.webhookUrl, {
    body: JSON.stringify(formatOpsSlackPayload(event)),
    headers: { "Content-Type": "application/json; charset=utf-8" },
    method: "POST",
    signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Ops Slack delivery failed with status ${response.status}.`);
}
