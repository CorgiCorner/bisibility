import { publicIdSchema } from "./openapi-public-id";

export const competitorSchemas = {
  Competitor: {
    properties: {
      domain: { type: "string" },
      id: publicIdSchema("cmp"),
      label: { type: ["string", "null"] },
    },
    required: ["id", "domain"],
    type: "object",
  },
  CompetitorCreate: {
    properties: {
      domain: { type: "string" },
      label: { type: "string" },
    },
    required: ["domain"],
    type: "object",
  },
  CompetitorMarket: {
    properties: {
      quality: {
        type: "object",
        properties: {
          metric_id: { type: "string", enum: ["competitor_share_of_voice_top10"] },
          definition_version: { type: "string", enum: ["bisibility-sov-top10-v1"] },
          domain_set: { type: "array", items: { type: "string" } },
          expected: { type: "integer" },
          measured: { type: "integer" },
          unknown: { type: "integer" },
          stale: { type: "integer" },
          data_coverage: { type: ["number", "null"] },
          observed_coverage: { type: ["number", "null"] },
          imputed_weight_share: { type: ["number", "null"] },
        },
        required: [
          "metric_id",
          "definition_version",
          "domain_set",
          "expected",
          "measured",
          "unknown",
          "stale",
          "data_coverage",
          "observed_coverage",
          "imputed_weight_share",
        ],
      },
      checked_keyword_count: {
        description: "Number of tracked keywords with a completed check in this market.",
        type: "integer",
      },
      country: { description: "Resolved location display name.", type: "string" },
      data_state: {
        description:
          "Why the matrix looks the way it does: ranked, quality_unknown, no_volume_data, completed_unranked, no_completed_checks, or filter_excludes_all.",
        enum: [
          "ranked",
          "quality_unknown",
          "no_volume_data",
          "completed_unranked",
          "no_completed_checks",
          "filter_excludes_all",
        ],
        type: "string",
      },
      device: { enum: ["Desktop", "Mobile"], type: "string" },
      domains: {
        items: {
          properties: {
            domain: { type: "string" },
            managed: { description: "True for tracked competitors.", type: "boolean" },
          },
          required: ["domain", "managed"],
          type: "object",
        },
        type: "array",
      },
      engine: { type: "string" },
      id: { description: "Market key: location, device, and engine.", type: "string" },
      measured_at: {
        description: "Check date of the newest completed observation, when any exist.",
        format: "date-time",
        type: ["string", "null"],
      },
      observations: {
        items: {
          properties: {
            checked_at: {
              description: "Check date that produced the ranks, when the check completed.",
              format: "date-time",
              type: ["string", "null"],
            },
            completed: { type: "boolean" },
            id: { type: "string" },
            keyword: { type: "string" },
            keyword_id: { type: "string" },
            ranked: { type: "boolean" },
            ranks: {
              additionalProperties: { type: ["integer", "null"] },
              description: "Best rank per domain in the latest completed check.",
              type: "object",
            },
            tags: { items: { type: "string" }, type: "array" },
          },
          required: [
            "id",
            "keyword",
            "keyword_id",
            "completed",
            "ranked",
            "tags",
            "checked_at",
            "ranks",
          ],
          type: "object",
        },
        type: "array",
      },
      shared_keyword_count: {
        description: "Completed keywords where a tracked competitor ranks.",
        type: "integer",
      },
      shares: {
        items: {
          properties: {
            domain: { type: "string" },
            share_of_voice: {
              description:
                "Exact Top10 SoV fraction using shared median weights for unknown volume and the same qualified keyword cohort across selected domains. Null when the score denominator is zero.",
              type: ["number", "null"],
            },
            shared_keywords: { type: "integer" },
          },
          required: ["domain", "shared_keywords", "share_of_voice"],
          type: "object",
        },
        type: "array",
      },
    },
    required: [
      "id",
      "country",
      "device",
      "engine",
      "data_state",
      "checked_keyword_count",
      "shared_keyword_count",
      "measured_at",
      "domains",
      "observations",
      "shares",
    ],
    type: "object",
  },
  CompetitorSuggestion: {
    properties: {
      domain: { type: "string" },
      overlap: { description: "Keywords where the domain appears in results.", type: "integer" },
    },
    required: ["domain", "overlap"],
    type: "object",
  },
} as const;
