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
