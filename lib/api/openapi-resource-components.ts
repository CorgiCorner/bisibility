import { alertRuleToolProperties } from "@/lib/alerts/tool-schema";
import { publicIdSchema } from "./openapi-public-id";
import { savedViewInputSchema, savedViewSchema } from "./openapi-saved-views";

const dateTime = { format: "date-time", type: "string" } as const;

export const resourceSchemas = {
  AlertRule: {
    properties: {
      ...alertRuleToolProperties,
      id: publicIdSchema("alr"),
    },
    required: ["id", "name", "condition_type"],
    type: "object",
  },
  Capability: {
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      name: { type: "string" },
    },
    required: ["id"],
    type: "object",
  },
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
      checked_keyword_count: {
        description: "Number of tracked keywords with a completed check in this market.",
        type: "integer",
      },
      country: { description: "Resolved location display name.", type: "string" },
      data_state: {
        description:
          "Why the matrix looks the way it does: ranked, no_volume_data, completed_unranked, no_completed_checks, or filter_excludes_all.",
        enum: [
          "ranked",
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
                "Exact fraction of volume-weighted visibility across the matrix domains. Null whenever data_state is not ranked, never zero for cannot-compute.",
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
  CostEstimate: {
    additionalProperties: true,
    description: "Estimated rank-check volume and provider spend for a keyword portfolio.",
    properties: {
      currency: { type: "string" },
      monthly_cost: { type: ["number", "null"] },
    },
    type: "object",
  },
  MigrationToken: {
    properties: {
      created_at: dateTime,
      expires_at: dateTime,
      id: publicIdSchema("mig"),
      token: { description: "Returned only when the token is minted.", type: "string" },
    },
    required: ["id", "expires_at"],
    type: "object",
  },
  NotificationPreferences: {
    properties: {
      alert_email: { type: "boolean" },
      alert_in_app: { type: "boolean" },
      alert_slack: { type: "boolean" },
      alert_webhook: { type: "boolean" },
      check_email: { type: "boolean" },
      check_in_app: { type: "boolean" },
      import_email: { type: "boolean" },
      import_in_app: { type: "boolean" },
      invite_email: { type: "boolean" },
      invite_in_app: { type: "boolean" },
    },
    required: [
      "alert_email",
      "alert_in_app",
      "alert_slack",
      "alert_webhook",
      "check_email",
      "check_in_app",
      "import_email",
      "import_in_app",
      "invite_email",
      "invite_in_app",
    ],
    type: "object",
  },
  OpenApiDocument: {
    additionalProperties: true,
    description: "OpenAPI 3 document for REST API v1.",
    type: "object",
  },
  ProviderConnect: {
    additionalProperties: true,
    properties: {
      credentials: { additionalProperties: { type: "string" }, type: "object" },
      primary: { type: "boolean" },
    },
    type: "object",
  },
  ProviderRateCard: {
    additionalProperties: true,
    properties: {
      id: { type: "string" },
      name: { type: "string" },
    },
    required: ["id"],
    type: "object",
  },
  ProviderTestResult: {
    properties: {
      message: { type: "string" },
      ok: { type: "boolean" },
    },
    required: ["ok"],
    type: "object",
  },
  SavedView: savedViewSchema,
  SavedViewInput: savedViewInputSchema,
  TeamInvite: {
    properties: {
      email: { format: "email", type: "string" },
      expires_at: dateTime,
      id: publicIdSchema("inv"),
      role: { enum: ["admin", "member", "viewer"], type: "string" },
    },
    required: ["id", "email", "role"],
    type: "object",
  },
  TeamInviteCreate: {
    properties: {
      email: { format: "email", type: "string" },
      role: { enum: ["admin", "member", "viewer"], type: "string" },
    },
    required: ["email", "role"],
    type: "object",
  },
  TeamMember: {
    properties: {
      email: { format: "email", type: "string" },
      id: publicIdSchema("mbr"),
      role: { enum: ["admin", "member", "owner", "viewer"], type: "string" },
    },
    required: ["id", "email", "role"],
    type: "object",
  },
  TriggeredAlert: {
    additionalProperties: true,
    properties: {
      created_at: dateTime,
      id: publicIdSchema("tal"),
      rule_id: publicIdSchema("alr"),
    },
    required: ["id"],
    type: "object",
  },
} as const;
