export type PublicIdEntity =
  | "alert_rule"
  | "api_key"
  | "audit_log"
  | "cloud_import_job"
  | "competitor"
  | "ingest_hook"
  | "invite"
  | "keyword"
  | "membership"
  | "migration_token"
  | "notification"
  | "personal_access_token"
  | "project"
  | "provider_connection"
  | "rank_check"
  | "saved_keyword"
  | "saved_view"
  | "session"
  | "signal"
  | "tag"
  | "triggered_alert"
  | "user"
  | "webhook_endpoint";
export type PublicIdMaps = {
  external: ReadonlyMap<PublicIdEntity, ReadonlyMap<string, string>>;
  internal: ReadonlyMap<PublicIdEntity, ReadonlyMap<string, string>>;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isRecord(value)) throw new Error("Migration checksum payload must be JSON.");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function mapId(maps: PublicIdMaps, entity: PublicIdEntity, value: unknown) {
  return typeof value === "string" ? (maps.external.get(entity)?.get(value) ?? value) : value;
}

function mapStringArray(maps: PublicIdMaps, entity: PublicIdEntity, value: unknown) {
  return Array.isArray(value) ? value.map((item) => mapId(maps, entity, item)) : value;
}

function rewriteHref(maps: PublicIdMaps, value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/app/")) return value;
  const url = new URL(value, "https://bisibility.invalid");
  const segments = url.pathname.split("/");
  if (segments[1] !== "app" || !segments[2]) return value;
  segments[2] = String(mapId(maps, "project", segments[2]));
  for (let index = 3; index < segments.length - 1; index += 1) {
    if (segments[index] === "keywords") {
      segments[index + 1] = String(mapId(maps, "keyword", segments[index + 1]));
    }
  }
  return `${segments.join("/")}${url.search}${url.hash}`;
}

export function rewriteNotificationPayload(maps: PublicIdMaps, value: unknown) {
  if (!isRecord(value)) return value;
  return {
    ...value,
    ...("alertId" in value ? { alertId: mapId(maps, "triggered_alert", value.alertId) } : {}),
    ...("href" in value ? { href: rewriteHref(maps, value.href) } : {}),
    ...("keywordId" in value ? { keywordId: mapId(maps, "keyword", value.keywordId) } : {}),
    ...("ruleId" in value ? { ruleId: mapId(maps, "alert_rule", value.ruleId) } : {}),
  };
}

export function rewriteSavedViewConfig(maps: PublicIdMaps, value: unknown) {
  if (!isRecord(value) || value.surface !== "competitors" || !isRecord(value.filters)) return value;
  return {
    ...value,
    filters: {
      ...value.filters,
      ...("excludedKeywordIds" in value.filters
        ? { excludedKeywordIds: mapStringArray(maps, "keyword", value.filters.excludedKeywordIds) }
        : {}),
    },
  };
}

function rewriteSourceKeywordIds(maps: PublicIdMaps, value: unknown) {
  if (!isRecord(value)) return value;
  const next: JsonRecord = {};
  for (const [key, item] of Object.entries(value)) {
    const mapped = String(mapId(maps, "keyword", key));
    if (mapped in next && mapped !== key) {
      throw new Error("Public ID migration would merge source keyword IDs.");
    }
    next[mapped] = item;
  }
  return next;
}

function rewriteAlertRules(maps: PublicIdMaps, value: unknown) {
  if (!Array.isArray(value)) return value;
  return value.map((rule) => {
    if (!isRecord(rule)) return rule;
    return {
      ...rule,
      ...("id" in rule ? { id: mapId(maps, "alert_rule", rule.id) } : {}),
      ...(Array.isArray(rule.targets)
        ? {
            targets: rule.targets.map((target) =>
              isRecord(target) && "keywordId" in target
                ? { ...target, keywordId: mapId(maps, "keyword", target.keywordId) }
                : target,
            ),
          }
        : {}),
    };
  });
}

function rewriteCompetitors(maps: PublicIdMaps, value: unknown) {
  return Array.isArray(value)
    ? value.map((competitor) =>
        isRecord(competitor) && "id" in competitor
          ? { ...competitor, id: mapId(maps, "competitor", competitor.id) }
          : competitor,
      )
    : value;
}

function rewriteSavedViews(maps: PublicIdMaps, value: unknown) {
  return Array.isArray(value)
    ? value.map((view) =>
        isRecord(view) && "config" in view
          ? {
              ...view,
              ...("id" in view ? { id: mapId(maps, "saved_view", view.id) } : {}),
              config: rewriteSavedViewConfig(maps, view.config),
            }
          : view,
      )
    : value;
}

export function rewriteMigrationChunkPayload(maps: PublicIdMaps, kind: string, value: unknown) {
  if (!isRecord(value)) return value;
  if (kind === "keywords" && Array.isArray(value.keywords)) {
    return {
      ...value,
      keywords: value.keywords.map((keyword) =>
        isRecord(keyword) && "id" in keyword
          ? { ...keyword, id: mapId(maps, "keyword", keyword.id) }
          : keyword,
      ),
    };
  }
  if (kind !== "sections" || !isRecord(value.sections)) return value;
  return {
    ...value,
    sections: {
      ...value.sections,
      ...("alertRules" in value.sections
        ? { alertRules: rewriteAlertRules(maps, value.sections.alertRules) }
        : {}),
      ...("competitors" in value.sections
        ? { competitors: rewriteCompetitors(maps, value.sections.competitors) }
        : {}),
      ...("savedViews" in value.sections
        ? { savedViews: rewriteSavedViews(maps, value.sections.savedViews) }
        : {}),
      ...("sourceKeywordIds" in value.sections
        ? { sourceKeywordIds: rewriteSourceKeywordIds(maps, value.sections.sourceKeywordIds) }
        : {}),
    },
  };
}

function rewriteAuditValue(
  maps: PublicIdMaps,
  action: string,
  position: "after" | "before",
  value: unknown,
) {
  if (!isRecord(value)) return value;
  if (action.startsWith("rank_check.") && position === "after" && "keywordId" in value) {
    return { ...value, keywordId: mapId(maps, "keyword", value.keywordId) };
  }
  if (action === "signal.ingested" && position === "after" && "id" in value) {
    return { ...value, id: mapId(maps, "signal", value.id) };
  }
  if (action === "keyword.csv_import" && position === "after" && "created" in value) {
    return { ...value, created: mapStringArray(maps, "keyword", value.created) };
  }
  if (action.startsWith("sample_data.") && "publicId" in value) {
    return { ...value, publicId: mapId(maps, "project", value.publicId) };
  }
  if (action === "account.session_revoked" && position === "before" && "id" in value) {
    return { ...value, id: mapId(maps, "session", value.id) };
  }
  if (action.startsWith("alert_rule.") && "id" in value) {
    return { ...value, id: mapId(maps, "alert_rule", value.id) };
  }
  if (action.startsWith("competitor.") && "id" in value) {
    return { ...value, id: mapId(maps, "competitor", value.id) };
  }
  if (action.startsWith("ingest_hook.") && "id" in value) {
    return { ...value, id: mapId(maps, "ingest_hook", value.id) };
  }
  if (action.startsWith("webhook_endpoint.") && "publicId" in value) {
    return { ...value, publicId: mapId(maps, "webhook_endpoint", value.publicId) };
  }
  if (
    [
      "cloud_import.begin",
      "cloud_import.create",
      "cloud_import.done",
      "cloud_import.fail",
      "cloud_import.session_create",
    ].includes(action) &&
    position === "after" &&
    "jobId" in value
  ) {
    return { ...value, jobId: mapId(maps, "cloud_import_job", value.jobId) };
  }
  if (["cloud_import.advance", "cloud_import.cancel"].includes(action) && "id" in value) {
    return { ...value, id: mapId(maps, "cloud_import_job", value.id) };
  }
  if (action === "migration_token.consume" && position === "after" && "id" in value) {
    return { ...value, id: mapId(maps, "migration_token", value.id) };
  }
  if (action.startsWith("saved_view.") && "savedViewId" in value) {
    return { ...value, savedViewId: mapId(maps, "saved_view", value.savedViewId) };
  }
  if (action === "saved_keyword.remove" && position === "before" && "publicIds" in value) {
    return { ...value, publicIds: mapStringArray(maps, "saved_keyword", value.publicIds) };
  }
  if (action === "team.invite.accept" && position === "after" && "inviteId" in value) {
    return { ...value, inviteId: mapId(maps, "invite", value.inviteId) };
  }
  return value;
}

export const auditTargetEntity = {
  alert_rule: "alert_rule",
  api_key: "api_key",
  audit_log: "audit_log",
  cloud_import_job: "cloud_import_job",
  competitor: "competitor",
  ingest_hook: "ingest_hook",
  invite: "invite",
  keyword: "keyword",
  membership: "membership",
  migration_token: "migration_token",
  notification: "notification",
  personal_access_token: "personal_access_token",
  project: "project",
  provider_connection: "provider_connection",
  rank_check: "rank_check",
  saved_keyword: "saved_keyword",
  saved_view: "saved_view",
  session: "session",
  signal: "signal",
  tag: "tag",
  triggered_alert: "triggered_alert",
  user: "user",
  webhook_endpoint: "webhook_endpoint",
} as const satisfies Record<string, PublicIdEntity>;

export function auditTargetPublicIdEntity(targetType: string) {
  return auditTargetEntity[targetType as keyof typeof auditTargetEntity] ?? null;
}

export function rewriteAuditRecord(
  maps: PublicIdMaps,
  row: { action: string; after: unknown; before: unknown; targetId: string; targetType: string },
) {
  const entity = auditTargetPublicIdEntity(row.targetType);
  return {
    ...row,
    after: rewriteAuditValue(maps, row.action, "after", row.after),
    before: rewriteAuditValue(maps, row.action, "before", row.before),
    targetId: entity
      ? (maps.internal.get(entity)?.get(row.targetId) ?? String(mapId(maps, entity, row.targetId)))
      : row.targetId,
  };
}

export function rewriteCloudImportManifest(maps: PublicIdMaps, value: unknown) {
  if (!isRecord(value)) return value;
  return {
    ...value,
    ...("source_project_id" in value
      ? { source_project_id: mapId(maps, "project", value.source_project_id) }
      : {}),
    version: 5,
  };
}
