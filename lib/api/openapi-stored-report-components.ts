import { backlinkHistory, backlinkRows, backlinksSchemas } from "./openapi-backlinks";
import { domainOverviewSchemas } from "./openapi-domain-overview-schemas";
import { constraintUnion, openEnum, sdkName } from "./openapi-sdk-schema";
import {
  dateSchema,
  domainOverviewReportProperties,
  freshnessDesc,
  freshnessSchema,
  freshUntilSchema,
  keywordResearchReportProperties,
  storageFields,
} from "./openapi-stored-report-parts";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const storedBacklinkRows = {
  ...backlinkRows,
  items: {
    ...backlinkRows.items,
    ...sdkName("StoredBacklinkRow"),
    properties: {
      ...backlinkRows.items.properties,
      anchor: { type: ["string", "null"] },
      domain_authority: { type: ["number", "null"] },
      first_seen: { format: "date", type: ["string", "null"] },
      spam_score: { type: ["number", "null"] },
    },
  },
};
const storedBacklinkHistory = {
  ...backlinkHistory,
  items: {
    ...backlinkHistory.items,
    ...sdkName("StoredBacklinksHistoryMonth"),
    properties: {
      ...backlinkHistory.items.properties,
      lost_referring_domains: { type: "number" },
      new_referring_domains: { type: "number" },
    },
    required: [
      ...backlinkHistory.items.required,
      "lost_referring_domains",
      "new_referring_domains",
    ],
  },
};
const storedBacklinkProperties = {
  ...backlinksSchemas.BacklinksSnapshot.properties,
  ...storageFields.properties,
  rows: storedBacklinkRows,
  history: storedBacklinkHistory,
};

// The path chooses the report kind; the wire body has no common discriminator.
// Emit one typed record and retain kind-specific shape rules as validation constraints.
const storedReportProperties = {
  ...storedBacklinkProperties,
  ...domainOverviewReportProperties,
  ...keywordResearchReportProperties,
  country_code: { type: ["string", "null"] },
  rows: {
    type: "array",
    items: {
      ...sdkName("StoredResearchReportRow"),
      type: "object",
      properties: {
        ...storedBacklinkRows.items.properties,
        ...keywordResearchReportProperties.rows.items.properties,
      },
      oneOf: [storedBacklinkRows.items, keywordResearchReportProperties.rows.items],
      ...constraintUnion,
    },
  },
  history: {
    type: ["array", "null"],
    items: {
      ...sdkName("StoredResearchReportHistoryRow"),
      type: "object",
      properties: {
        ...storedBacklinkHistory.items.properties,
        ...domainOverviewSchemas.DomainOverviewHistoricalRow.properties,
        month: { type: ["string", "integer"] },
      },
      oneOf: [storedBacklinkHistory.items, domainOverviewSchemas.DomainOverviewHistoricalRow],
      ...constraintUnion,
    },
  },
};

export const researchReportsSchemas = {
  StoredBacklinksReport: {
    properties: storedBacklinkProperties,
    required: [...backlinksSchemas.BacklinksSnapshot.required, ...storageFields.required],
    type: "object",
  },
  StoredDomainOverviewReport: {
    properties: domainOverviewReportProperties,
    required: Object.keys(domainOverviewReportProperties),
    type: "object",
  },
  StoredKeywordResearchReport: {
    properties: keywordResearchReportProperties,
    required: Object.keys(keywordResearchReportProperties),
    type: "object",
  },
  StoredResearchReportSummary: {
    properties: {
      country_code: { type: "string" },
      fresh_until: freshUntilSchema,
      include_clickstream: { type: "boolean" },
      include_subdomains: { type: "boolean" },
      kind: {
        enum: ["backlinks", "domain_overview", "keyword_research"],
        type: "string",
        ...openEnum("StoredReportKind"),
      },
      language_code: { type: "string" },
      location_code: { type: "integer" },
      mode: { type: "string" },
      result_limit: { type: "integer" },
      saved_at: dateSchema,
      seed: { type: "string" },
      state: freshnessSchema,
      target: { type: "string" },
      target_scope: {
        description: "site or page for backlinks, root or subdomain for domain overviews.",
        type: "string",
      },
    },
    required: ["kind", "saved_at", "fresh_until", "state"],
    type: "object",
  },
  StoredResearchReportsResponse: {
    properties: {
      data: { items: ref("StoredResearchReportSummary"), type: "array" },
      meta: {
        ...sdkName("StoredResearchReportsMeta"),
        properties: {
          freshness_days: {
            description: freshnessDesc,
            type: "integer",
          },
        },
        required: ["freshness_days"],
        type: "object",
      },
    },
    required: ["data", "meta"],
    type: "object",
  },
  StoredResearchReport: {
    description:
      "Stored report selected by the kind path parameter. The common fields are always present; the remaining fields are constrained by that report kind.",
    required: [
      "cached",
      "cost_cents",
      "fetched_at",
      "fresh_until",
      "provider",
      "saved_at",
      "stale",
      "state",
    ],
    properties: storedReportProperties,
    type: "object",
    oneOf: [
      ref("StoredBacklinksReport"),
      ref("StoredDomainOverviewReport"),
      ref("StoredKeywordResearchReport"),
    ],
    ...constraintUnion,
  },
  StoredResearchReportResponse: {
    properties: {
      data: ref("StoredResearchReport"),
    },
    required: ["data"],
    type: "object",
  },
} as const;
