import { type PublicIdPrefix, parsePublicId } from "@/lib/db/public-id";

export const publicIdEntities = [
  ["user", "users", "usr"],
  ["session", "sessions", "sid"],
  ["membership", "memberships", "mbr"],
  ["project", "projects", "prj"],
  ["keyword", "keywords", "kw"],
  ["saved_keyword", "saved_keywords", "svkw"],
  ["tag", "tags", "tag"],
  ["competitor", "competitors", "cmp"],
  ["rank_check", "rank_checks", "check"],
  ["provider_connection", "provider_connections", "conn"],
  ["api_key", "api_keys", "key"],
  ["personal_access_token", "personal_access_tokens", "pat"],
  ["audit_log", "audit_logs", "audit"],
  ["alert_rule", "alert_rules", "alr"],
  ["triggered_alert", "triggered_alerts", "al"],
  ["webhook_endpoint", "webhook_endpoints", "we"],
  ["saved_view", "saved_views", "viw"],
  ["notification", "notifications", "ntf"],
  ["invite", "invites", "inv"],
  ["migration_token", "migration_tokens", "ferry"],
  ["cloud_import_job", "cloud_import_jobs", "imp"],
  ["ingest_hook", "ingest_hooks", "dwh"],
  ["signal", "signals", "sig"],
] as const;

export type PublicIdMigrationEntity = (typeof publicIdEntities)[number][0];

export const legacyPublicIdEntityByPrefix = {
  alert: "triggered_alert",
  comp: "competitor",
  hook: "ingest_hook",
  invite: "invite",
  job: "cloud_import_job",
  member: "membership",
  mtok: "migration_token",
  notif: "notification",
  rule: "alert_rule",
  ses: "session",
  skw: "saved_keyword",
  view: "saved_view",
  webhook: "webhook_endpoint",
} as const satisfies Readonly<Record<string, PublicIdMigrationEntity>>;

export const publicIdMigrationEntityByObservedPrefix = Object.fromEntries([
  ...publicIdEntities.map(([entityType, _table, prefix]) => [prefix, entityType] as const),
  ...Object.entries(legacyPublicIdEntityByPrefix),
]) as Readonly<Record<string, PublicIdMigrationEntity>>;

export type PublicIdEntityDefinition = {
  entityType: PublicIdMigrationEntity;
  prefix: PublicIdPrefix;
  table: string;
};

export const publicIdEntityDefinitions: readonly PublicIdEntityDefinition[] = publicIdEntities.map(
  ([entityType, table, prefix]) => ({ entityType, prefix, table }),
);

export function isExpectedPublicId(entity: PublicIdEntityDefinition, value: string | null) {
  return value !== null && parsePublicId(value)?.prefix === entity.prefix;
}
