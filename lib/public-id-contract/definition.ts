import type { PublicIdPrefix } from "@/lib/db/public-id";

export const publicIdContractEntities = [
  { entityType: "user", prefix: "usr", table: "users" },
  { entityType: "session", prefix: "sid", table: "sessions" },
  { entityType: "membership", prefix: "mbr", table: "memberships" },
  { entityType: "project", prefix: "prj", table: "projects" },
  { entityType: "keyword", prefix: "kw", table: "keywords" },
  { entityType: "saved_keyword", prefix: "svkw", table: "saved_keywords" },
  { entityType: "tag", prefix: "tag", table: "tags" },
  { entityType: "competitor", prefix: "cmp", table: "competitors" },
  { entityType: "rank_check", prefix: "check", table: "rank_checks" },
  { entityType: "provider_connection", prefix: "conn", table: "provider_connections" },
  { entityType: "api_key", prefix: "key", table: "api_keys" },
  { entityType: "personal_access_token", prefix: "pat", table: "personal_access_tokens" },
  { entityType: "audit_log", prefix: "audit", table: "audit_logs" },
  { entityType: "alert_rule", prefix: "alr", table: "alert_rules" },
  { entityType: "triggered_alert", prefix: "al", table: "triggered_alerts" },
  { entityType: "webhook_endpoint", prefix: "we", table: "webhook_endpoints" },
  { entityType: "saved_view", prefix: "viw", table: "saved_views" },
  { entityType: "notification", prefix: "ntf", table: "notifications" },
  { entityType: "invite", prefix: "inv", table: "invites" },
  { entityType: "migration_token", prefix: "ferry", table: "migration_tokens" },
  { entityType: "cloud_import_job", prefix: "imp", table: "cloud_import_jobs" },
  { entityType: "ingest_hook", prefix: "dwh", table: "ingest_hooks" },
  { entityType: "signal", prefix: "sig", table: "signals" },
] as const satisfies readonly {
  entityType: string;
  prefix: PublicIdPrefix;
  table: string;
}[];

export const highVolumePublicIdTables = [
  "rank_checks",
  "audit_logs",
  "triggered_alerts",
  "notifications",
] as const;

export type HighVolumePublicIdTable = (typeof highVolumePublicIdTables)[number];

export function publicIdIndexName(table: string) {
  return `${table}_publicId_key`;
}

export function publicIdNotNullConstraintName(table: string) {
  return `${table}_public_id_contract_not_null`;
}

export function publicIdFormatConstraintName(table: string) {
  return `${table}_public_id_contract_format`;
}

export function publicIdFormatPattern(prefix: string) {
  return `^${prefix}_[a-z][a-z0-9]{23}$`;
}

export function isHighVolumePublicIdTable(table: string): table is HighVolumePublicIdTable {
  return highVolumePublicIdTables.some((candidate) => candidate === table);
}
