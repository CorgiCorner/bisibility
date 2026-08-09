import type { PublicIdPrefix } from "@/lib/db/public-id";

type PublicAuditTargetPolicy = {
  mode: "public";
  prefix: PublicIdPrefix;
  resource: string;
};

type OpaqueAuditTargetPolicy = {
  mode: "opaque";
};

export type AuditTargetPolicy = OpaqueAuditTargetPolicy | PublicAuditTargetPolicy;

export const AUDIT_TARGET_POLICIES = {
  alert_rule: { mode: "public", prefix: "alr", resource: "Alert rule" },
  api_key: { mode: "public", prefix: "key", resource: "API key" },
  authentication: { mode: "opaque" },
  authorization: { mode: "opaque" },
  cloud_import_job: { mode: "public", prefix: "imp", resource: "Instance import job" },
  competitor: { mode: "public", prefix: "cmp", resource: "Competitor" },
  ingest_hook: { mode: "public", prefix: "dwh", resource: "Ingest hook" },
  instance_ops: { mode: "opaque" },
  invite: { mode: "public", prefix: "inv", resource: "Invite" },
  keyword: { mode: "public", prefix: "kw", resource: "Keyword" },
  keyword_schedule: { mode: "public", prefix: "kw", resource: "Keyword schedule" },
  membership: { mode: "public", prefix: "mbr", resource: "Membership" },
  migration_token: { mode: "public", prefix: "ferry", resource: "Migration token" },
  notification: { mode: "public", prefix: "ntf", resource: "Notification" },
  personal_access_token: { mode: "public", prefix: "pat", resource: "Personal access token" },
  project: { mode: "public", prefix: "prj", resource: "Project" },
  project_defaults: { mode: "public", prefix: "prj", resource: "Project defaults" },
  provider_connection: { mode: "public", prefix: "conn", resource: "Provider connection" },
  rank_check: { mode: "public", prefix: "check", resource: "Rank-check" },
  saved_keyword: { mode: "public", prefix: "svkw", resource: "Saved keyword" },
  saved_view: { mode: "public", prefix: "viw", resource: "Saved view" },
  session: { mode: "public", prefix: "sid", resource: "Session" },
  signal: { mode: "public", prefix: "sig", resource: "Signal" },
  sitemap_monitor: { mode: "public", prefix: "prj", resource: "Sitemap monitor" },
  slack_connection: { mode: "opaque" },
  system: { mode: "opaque" },
  tag: { mode: "public", prefix: "tag", resource: "Tag" },
  triggered_alert: { mode: "public", prefix: "al", resource: "Triggered alert" },
  user: { mode: "public", prefix: "usr", resource: "User" },
  webhook_endpoint: { mode: "public", prefix: "we", resource: "Webhook endpoint" },
} as const satisfies Record<string, AuditTargetPolicy>;

export function auditTargetPolicy(targetType: string): AuditTargetPolicy | null {
  return Object.hasOwn(AUDIT_TARGET_POLICIES, targetType)
    ? AUDIT_TARGET_POLICIES[targetType as keyof typeof AUDIT_TARGET_POLICIES]
    : null;
}
