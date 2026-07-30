export type ContractFixtureDatabase = {
  query(sql: string, values?: readonly unknown[]): Promise<unknown>;
};

export const fixtureIds = {
  alert_rule: "rule-1",
  api_key: "api-key-1",
  audit_log: "audit-1",
  cloud_import_job: "job-1",
  competitor: "competitor-1",
  ingest_hook: "hook-1",
  invite: "invite-1",
  keyword: "keyword-1",
  membership: "membership-1",
  migration_token: "migration-token-1",
  migration_keyword_chunk: "migration-keyword-chunk-1",
  migration_sections_chunk: "migration-sections-chunk-1",
  notification: "notification-1",
  personal_access_token: "pat-1",
  project: "project-1",
  provider_connection: "connection-1",
  rank_check: "rank-check-1",
  saved_keyword: "saved-keyword-1",
  saved_view: "view-1",
  session: "session-1",
  signal: "signal-1",
  tag: "tag-1",
  triggered_alert: "alert-1",
  user: "user-1",
  webhook_endpoint: "webhook-1",
} as const;

export const auditFixtureIds = {
  alertRule: "audit-alert-rule",
  cloudAdvance: "audit-cloud-advance",
  cloudBegin: "audit-cloud-begin",
  cloudCancel: "audit-cloud-cancel",
  cloudCreate: "audit-cloud-create",
  cloudDone: "audit-cloud-done",
  cloudFail: "audit-cloud-fail",
  cloudSessionCreate: "audit-cloud-session-create",
  competitor: "audit-competitor",
  ingestHook: "audit-ingest-hook",
  inviteAccept: "audit-invite-accept",
  migrationToken: "audit-migration-token",
  orphanLegacySession: "audit-orphan-legacy-session",
  orphanProject: "audit-orphan-project",
  savedKeyword: "audit-saved-keyword",
  savedView: "audit-saved-view",
  sessionRevoked: "audit-session-revoked",
  webhookEndpoint: "audit-webhook-endpoint",
} as const;

const updatedAtTables = new Set([
  "alert_rules",
  "api_keys",
  "cloud_import_jobs",
  "competitors",
  "ingest_hooks",
  "keywords",
  "locations",
  "memberships",
  "personal_access_tokens",
  "projects",
  "provider_connections",
  "rank_checks",
  "saved_views",
  "sessions",
  "tags",
  "triggered_alerts",
  "users",
  "webhook_endpoints",
]);

export async function insertFixtureRow(
  db: ContractFixtureDatabase,
  table: string,
  columns: string[],
  values: unknown[],
) {
  const nextColumns = [...columns];
  const nextValues = [...values];
  if (updatedAtTables.has(table) && !nextColumns.includes("updatedAt")) {
    nextColumns.push("updatedAt");
    nextValues.push(new Date());
  }
  const fields = nextColumns.map((column) => `"${column}"`).join(", ");
  const placeholders = nextValues.map((_, index) => `$${index + 1}`).join(", ");
  await db.query(`INSERT INTO "${table}" (${fields}) VALUES (${placeholders})`, nextValues);
}

type PublicIdFixtureOptions = {
  apiKeyPrefix?: string;
  includeBacklinkPublicId?: boolean;
  personalTokenPrefix?: string;
  prefixOverrides?: Readonly<Record<string, string>>;
};

export async function createPreparedNFixture(
  db: ContractFixtureDatabase,
  options: PublicIdFixtureOptions = {},
) {
  const insert = (table: string, columns: string[], values: unknown[]) =>
    insertFixtureRow(db, table, columns, values);
  const id = (prefix: string) =>
    `${options.prefixOverrides?.[prefix] ?? prefix}_a00000000000000000000000`;

  await insert("users", ["id", "publicId", "name", "email"], ["user-1", id("usr"), "Fixture", "fixture@example.com"]);
  await insert("sessions", ["id", "publicId", "token", "expiresAt", "userId"], ["session-1", id("sid"), "session-token", new Date("2030-01-01T00:00:00.000Z"), "user-1"]);
  await insert("projects", ["id", "publicId", "name", "domain", "ownerId"], ["project-1", id("prj"), "Fixture", "fixture.example.com", "user-1"]);
  await insert("memberships", ["id", "publicId", "userId", "projectId", "role"], ["membership-1", id("mbr"), "user-1", "project-1", "owner"]);
  await insert("locations", ["id", "kind", "displayName", "countryCode", "gl", "hl", "languageLabel", "primaryGeoName", "secondaryGeoName", "canonicalKey"], ["location-1", "country", "United States", "US", "us", "en", "English", "United States", "", "country:US"]);
  await insert("keywords", ["id", "publicId", "projectId", "text", "location", "locationId", "device"], ["keyword-1", id("kw"), "project-1", "fixture keyword", "United States", "location-1", "desktop"]);
  await insert("saved_keywords", ["id", "publicId", "projectId", "text", "normalizedText", "location"], ["saved-keyword-1", id("svkw"), "project-1", "fixture keyword", "fixture keyword", "United States"]);
  await insert("tags", ["id", "publicId", "projectId", "name"], ["tag-1", id("tag"), "project-1", "fixture"]);
  await insert("competitors", ["id", "publicId", "projectId", "domain"], ["competitor-1", id("cmp"), "project-1", "competitor.example.org"]);
  await insert("rank_checks", ["id", "publicId", "keywordId", "provider", "workflowRunId"], ["rank-check-1", id("check"), "keyword-1", "fixture", "temporal-workflow-identity"]);
  await insert("provider_connections", ["id", "publicId", "projectId", "kind", "provider", "status"], ["connection-1", id("conn"), "project-1", "serp", "fixture", "connected"]);
  await insert("api_keys", ["id", "publicId", "projectId", "name", "hashedKey", "prefix"], ["api-key-1", id("key"), "project-1", "fixture", "sha256:fixture-api-key", options.apiKeyPrefix ?? "bsb_key_live_fixture"]);
  await insert("personal_access_tokens", ["id", "publicId", "userId", "name", "hashedKey", "prefix"], ["pat-1", id("pat"), "user-1", "fixture", "sha256:fixture-pat", options.personalTokenPrefix ?? "bsb_pat_live_fixture"]);
  await insert("ingest_hooks", ["id", "publicId", "projectId", "label", "tokenHash"], ["hook-1", id("dwh"), "project-1", "fixture", "sha256:fixture-hook"]);
  await insert("signals", ["id", "publicId", "projectId", "keywordId", "source", "type"], ["signal-1", id("sig"), "project-1", "keyword-1", "manual", "fixture"]);
  await insert("alert_rules", ["id", "publicId", "projectId", "name", "conditionType", "channels", "severity"], ["rule-1", id("alr"), "project-1", "fixture", "threshold", ["email"], "warning"]);
  await insert("triggered_alerts", ["id", "publicId", "ruleId", "keywordId", "rankCheckId"], ["alert-1", id("al"), "rule-1", "keyword-1", "rank-check-1"]);
  await insert("webhook_endpoints", ["id", "publicId", "projectId", "url", "hmacSecret"], ["webhook-1", id("we"), "project-1", "https://hook.example.com", "fixture-secret"]);
  await insert("saved_views", ["id", "publicId", "projectId", "name", "config"], ["view-1", id("viw"), "project-1", "fixture", JSON.stringify({ filters: { excludedKeywordIds: [id("kw")] }, surface: "competitors" })]);
  await insert("notifications", ["id", "publicId", "userId", "projectId", "type", "title", "payload"], ["notification-1", id("ntf"), "user-1", "project-1", "system", "fixture", JSON.stringify({ alertId: id("al"), href: `/app/${id("prj")}/keywords/${id("kw")}`, jobId: "job-1", keywordId: id("kw"), rankCheckId: "rank-check-1", ruleId: id("alr") })]);
  await insert("invites", ["id", "publicId", "projectId", "email", "token", "expiresAt", "invitedById"], ["invite-1", id("inv"), "project-1", "invitee@example.org", "invite-token", new Date("2030-01-01T00:00:00.000Z"), "user-1"]);
  await insert("migration_tokens", ["id", "publicId", "projectId", "hash", "expiresAt", "createdById"], ["migration-token-1", id("ferry"), "project-1", "sha256:fixture-token", new Date("2030-01-01T00:00:00.000Z"), "user-1"]);
  await insert("cloud_import_jobs", ["id", "publicId", "projectId", "tokenId", "manifest"], ["job-1", id("imp"), "project-1", "migration-token-1", JSON.stringify({ source_project_id: id("prj"), version: 4 })]);
  const keywordChunkPayload = {
    keywords: [
      {
        device: "desktop",
        location: "United States",
        rankingHistory: [],
        text: "ordinary unchanged payload",
      },
    ],
  };
  const sectionsChunkPayload = { sections: {} };
  await insert(
    "migration_import_chunks",
    ["id", "jobId", "index", "checksum", "bytes", "kind", "payload"],
    [
      fixtureIds.migration_keyword_chunk,
      fixtureIds.cloud_import_job,
      0,
      `sha256:${"1".repeat(64)}`,
      JSON.stringify(keywordChunkPayload).length,
      "keywords",
      JSON.stringify(keywordChunkPayload),
    ],
  );
  await insert(
    "migration_import_chunks",
    ["id", "jobId", "index", "checksum", "bytes", "kind", "payload"],
    [
      fixtureIds.migration_sections_chunk,
      fixtureIds.cloud_import_job,
      1,
      `sha256:${"2".repeat(64)}`,
      JSON.stringify(sectionsChunkPayload).length,
      "sections",
      JSON.stringify(sectionsChunkPayload),
    ],
  );
  await insert("audit_logs", ["id", "publicId", "projectId", "action", "targetType", "targetId", "after"], ["audit-1", id("audit"), "project-1", "rank_check.create", "keyword", "keyword-1", JSON.stringify({ keywordId: id("kw") })]);
  const auditRows = [
    {
      action: "account.session_revoked",
      before: { id: id("sid") },
      id: auditFixtureIds.sessionRevoked,
    },
    {
      action: "alert_rule.update",
      after: { id: id("alr") },
      before: { id: id("alr") },
      id: auditFixtureIds.alertRule,
    },
    {
      action: "competitor.rename",
      after: { id: id("cmp") },
      before: { id: id("cmp") },
      id: auditFixtureIds.competitor,
    },
    {
      action: "ingest_hook.rotate",
      after: { id: id("dwh") },
      before: { id: id("dwh") },
      id: auditFixtureIds.ingestHook,
    },
    {
      action: "webhook_endpoint.update",
      after: { publicId: id("we") },
      before: { publicId: id("we") },
      id: auditFixtureIds.webhookEndpoint,
    },
    {
      action: "cloud_import.create",
      after: { jobId: id("imp") },
      id: auditFixtureIds.cloudCreate,
    },
    {
      action: "cloud_import.begin",
      after: { jobId: id("imp") },
      id: auditFixtureIds.cloudBegin,
    },
    {
      action: "cloud_import.session_create",
      after: { jobId: id("imp") },
      id: auditFixtureIds.cloudSessionCreate,
    },
    {
      action: "cloud_import.done",
      after: { jobId: id("imp") },
      id: auditFixtureIds.cloudDone,
    },
    {
      action: "cloud_import.fail",
      after: { jobId: id("imp") },
      id: auditFixtureIds.cloudFail,
    },
    {
      action: "cloud_import.advance",
      after: { id: id("imp") },
      before: { id: id("imp") },
      id: auditFixtureIds.cloudAdvance,
    },
    {
      action: "cloud_import.cancel",
      after: { id: id("imp") },
      before: { id: id("imp") },
      id: auditFixtureIds.cloudCancel,
    },
    {
      action: "migration_token.consume",
      after: { id: id("ferry") },
      id: auditFixtureIds.migrationToken,
    },
    {
      action: "saved_view.update",
      after: { savedViewId: id("viw") },
      before: { savedViewId: id("viw") },
      id: auditFixtureIds.savedView,
    },
    {
      action: "saved_keyword.remove",
      before: { publicIds: [id("svkw")] },
      id: auditFixtureIds.savedKeyword,
    },
    {
      action: "team.invite.accept",
      after: { inviteId: id("inv") },
      id: auditFixtureIds.inviteAccept,
    },
  ];
  for (const [index, row] of auditRows.entries()) {
    await insert(
      "audit_logs",
      ["id", "publicId", "projectId", "action", "targetType", "targetId", "before", "after"],
      [
        row.id,
        `audit_${String.fromCharCode("b".charCodeAt(0) + index)}${"0".repeat(23)}`,
        "project-1",
        row.action,
        "project",
        "project-1",
        "before" in row ? JSON.stringify(row.before) : null,
        "after" in row ? JSON.stringify(row.after) : null,
      ],
    );
  }
  await insert(
    "audit_logs",
    ["id", "publicId", "projectId", "action", "targetType", "targetId"],
    [
      auditFixtureIds.orphanProject,
      `audit_z${"0".repeat(23)}`,
      fixtureIds.project,
      "project.delete",
      "project",
      "deleted-project-1",
    ],
  );
  await insert(
    "audit_logs",
    ["id", "publicId", "projectId", "action", "targetType", "targetId"],
    [
      auditFixtureIds.orphanLegacySession,
      `audit_y${"0".repeat(23)}`,
      fixtureIds.project,
      "account.session_revoked",
      "session",
      `ses_z${"0".repeat(23)}`,
    ],
  );
  const backlinkColumns = [
    "id",
    ...(options.includeBacklinkPublicId === false ? [] : ["publicId"]),
    "projectId",
    "target",
    "targetScope",
    "summary",
    "history",
    "fetchedRowCount",
    "totalRowsAvailable",
    "costCents",
    "fetchedAt",
    "expiresAt",
  ];
  const backlinkValues = [
    "backlink-1",
    ...(options.includeBacklinkPublicId === false ? [] : ["backlink_unchanged"]),
    "project-1",
    "https://fixture.example.org",
    "domain",
    JSON.stringify({}),
    JSON.stringify([]),
    0,
    0,
    0,
    new Date("2026-01-01T00:00:00.000Z"),
    new Date("2030-01-01T00:00:00.000Z"),
  ];
  await insert("backlink_snapshots", backlinkColumns, backlinkValues);
}
