import { alertSeverities } from "@/lib/alerts/severity";
import { savedViewSurfaces } from "@/lib/saved-views/model";
import { serpDeviceValues, serpMarketOptions } from "@/lib/serp/markets";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const text = { type: "string" };
const nullableText = { type: ["string", "null"] };
const position = { minimum: 1, type: ["integer", "null"] };
const targetUrl = {
  description: "Absolute URL, path, null, or omitted.",
  maxLength: 500,
  type: ["string", "null"],
};
const publicId = (prefix: string) => ({ pattern: `^${prefix}_[a-z][a-z0-9]{23}$`, type: "string" });
const keywordSectionProperties = {
  keywords: { items: ref("CloudImportKeyword"), maxItems: 500, type: "array" },
  project_id: publicId("prj"),
  scope: { enum: ["current", "history"], type: "string" },
};

const importSectionProperties = {
  alert_rules: { items: ref("CloudImportAlertRule"), maxItems: 500, type: "array" },
  competitors: { items: ref("CloudImportCompetitor"), maxItems: 500, type: "array" },
  notification_preferences: {
    items: ref("CloudImportNotificationPreference"),
    maxItems: 50,
    type: "array",
  },
  saved_views: { items: ref("CloudImportSavedView"), maxItems: 500, type: "array" },
};

export const migrationSchemas = {
  CloudImportAlertRule: {
    additionalProperties: false,
    properties: {
      change_pct: { type: ["number", "null"] },
      channels: {
        items: { enum: ["email", "slack", "webhook"], type: "string" },
        type: "array",
      },
      competitor_domain: nullableText,
      condition_type: {
        enum: [
          "change_pct",
          "competitor_overtake",
          "ctr_drop",
          "downtrend",
          "enters_top_n",
          "exits_top_n",
          "position_drop",
          "serp_feature",
          "threshold",
          "url_mismatch",
        ],
        type: "string",
      },
      drop_positions: position,
      enabled: { type: "boolean" },
      id: publicId("alr"),
      name: { maxLength: 120, minLength: 1, type: "string" },
      serp_feature: nullableText,
      severity: { enum: alertSeverities, type: "string" },
      target_type: { enum: ["all", "keyword", "tag"], type: "string" },
      targets: { items: ref("CloudImportAlertRuleTarget"), maxItems: 1000, type: "array" },
      threshold_position: position,
      top_n: position,
    },
    required: ["id", "name"],
    type: "object",
  },
  CloudImportAlertRuleTarget: {
    discriminator: { propertyName: "type" },
    oneOf: [ref("CloudImportKeywordAlertTarget"), ref("CloudImportTagAlertTarget")],
  },
  CloudImportKeywordAlertTarget: {
    additionalProperties: false,
    properties: {
      device: { enum: serpDeviceValues, type: "string" },
      keyword: { maxLength: 180, minLength: 1, type: "string" },
      keyword_id: publicId("kw"),
      location: { enum: serpMarketOptions, type: "string" },
      type: { const: "keyword", type: "string" },
    },
    required: ["keyword_id", "type"],
    type: "object",
  },
  CloudImportTagAlertTarget: {
    additionalProperties: false,
    properties: {
      tag: { maxLength: 80, minLength: 1, type: "string" },
      type: { const: "tag", type: "string" },
    },
    required: ["tag", "type"],
    type: "object",
  },
  CloudImportChunkResponse: {
    properties: {
      chunk_count: { minimum: 1, type: "integer" },
      chunks_received: { minimum: 0, type: "integer" },
      state: { enum: ["receiving"], type: "string" },
    },
    required: ["state", "chunks_received", "chunk_count"],
    type: "object",
  },
  CloudImportCompatibility: {
    properties: {
      app_version: { type: "string" },
      latest_migration: { type: ["string", "null"] },
      schema_versions_supported: { items: { enum: [5], type: "integer" }, type: "array" },
    },
    required: ["schema_versions_supported", "app_version", "latest_migration"],
    type: "object",
  },
  CloudImportCompetitor: {
    additionalProperties: false,
    properties: {
      domain: {
        description:
          "Canonical lowercase hostname without a scheme, path, www prefix, surrounding whitespace, or trailing dot.",
        maxLength: 253,
        minLength: 1,
        type: "string",
      },
      id: publicId("cmp"),
      label: { maxLength: 80, type: ["string", "null"] },
    },
    required: ["id", "domain"],
    type: "object",
  },
  CloudImportCounts: {
    additionalProperties: { type: "integer" },
    type: "object",
  },
  CloudImportFinalizeResponse: {
    properties: {
      counts: ref("CloudImportCounts"),
      job_id: publicId("imp"),
      state: { enum: ["done"], type: "string" },
    },
    required: ["counts", "job_id", "state"],
    type: "object",
  },
  CloudImportKeyword: {
    additionalProperties: false,
    properties: {
      device: { enum: serpDeviceValues, type: "string" },
      id: publicId("kw"),
      keyword: { maxLength: 180, minLength: 1, type: "string" },
      location: { enum: serpMarketOptions, type: "string" },
      rankingHistory: {
        items: ref("CloudImportRankingHistory"),
        maxItems: 5000,
        type: "array",
      },
      tags: { items: { maxLength: 48, minLength: 1, type: "string" }, maxItems: 12, type: "array" },
      target_url: targetUrl,
    },
    required: ["id", "keyword", "device", "location"],
    type: "object",
  },
  CloudImportNotificationPreference: {
    additionalProperties: false,
    properties: {
      alert_email: { type: "boolean" },
      alert_in_app: { type: "boolean" },
      check_email: { type: "boolean" },
      check_in_app: { type: "boolean" },
      import_email: { type: "boolean" },
      import_in_app: { type: "boolean" },
      invite_email: { type: "boolean" },
      invite_in_app: { type: "boolean" },
      report_email: { type: "boolean" },
    },
    type: "object",
  },
  CloudImportPackage: {
    additionalProperties: false,
    properties: {
      ...keywordSectionProperties,
      ...importSectionProperties,
      exported_at: { format: "date-time", type: "string" },
      version: { const: 5, type: "integer" },
    },
    required: [
      "version",
      "project_id",
      "keywords",
      "alert_rules",
      "competitors",
      "notification_preferences",
      "saved_views",
    ],
    type: "object",
  },
  CloudImportRankingHistory: {
    additionalProperties: false,
    properties: {
      checkedAt: { format: "date-time", type: "string" },
      position,
      previousPosition: position,
      rankingUrl: targetUrl,
    },
    required: ["checkedAt"],
    type: "object",
  },
  CloudImportSavedView: {
    additionalProperties: false,
    properties: {
      config: {},
      id: publicId("viw"),
      name: { maxLength: 120, minLength: 1, type: "string" },
      surface: { enum: savedViewSurfaces, type: "string" },
    },
    required: ["id", "name"],
    type: "object",
  },
  CloudImportSessionCreate: {
    additionalProperties: false,
    properties: {
      chunk_count: { maximum: 500, minimum: 1, type: "integer" },
      totals: {
        additionalProperties: false,
        properties: {
          keywords: { minimum: 0, type: "integer" },
          rank_checks: { minimum: 0, type: "integer" },
        },
        type: "object",
      },
      source_project_id: publicId("prj"),
      version: { const: 5, type: "integer" },
    },
    required: ["version", "chunk_count", "source_project_id"],
    type: "object",
  },
  CloudImportSessionCreateResponse: {
    properties: {
      chunk_limits: {
        properties: {
          max_body_bytes: { minimum: 1, type: "integer" },
          max_history_rows: { minimum: 1, type: "integer" },
          max_keywords: { minimum: 1, type: "integer" },
        },
        required: ["max_body_bytes", "max_history_rows", "max_keywords"],
        type: "object",
      },
      session_id: publicId("imp"),
      state: { enum: ["receiving"], type: "string" },
    },
    required: ["session_id", "state", "chunk_limits"],
    type: "object",
  },
  CloudImportSessionSections: {
    additionalProperties: false,
    properties: {
      ...importSectionProperties,
      source_keyword_ids: { additionalProperties: ref("CloudImportSourceKeyword"), type: "object" },
    },
    type: "object",
  },
  CloudImportSourceKeyword: {
    additionalProperties: false,
    properties: {
      device: { enum: serpDeviceValues, type: "string" },
      location: { enum: serpMarketOptions, type: "string" },
      text,
    },
    required: ["device", "location", "text"],
    type: "object",
  },
  CloudImportUploadChunk: {
    oneOf: [
      {
        additionalProperties: false,
        properties: {
          checksum: { pattern: "^sha256:[0-9a-f]{64}$", type: "string" },
          kind: { const: "keywords", type: "string" },
          keywords: { items: ref("CloudImportKeyword"), maxItems: 500, type: "array" },
        },
        required: ["checksum", "kind", "keywords"],
        type: "object",
      },
      {
        additionalProperties: false,
        properties: {
          checksum: { pattern: "^sha256:[0-9a-f]{64}$", type: "string" },
          kind: { const: "sections", type: "string" },
          sections: ref("CloudImportSessionSections"),
        },
        required: ["checksum", "kind", "sections"],
        type: "object",
      },
    ],
  },
};
