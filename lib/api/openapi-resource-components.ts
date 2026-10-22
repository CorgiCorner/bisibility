import { alertRuleSchema, triggeredAlertSchema } from "./openapi-alert-response-components";
import { competitorSchemas } from "./openapi-competitor-components";
import { costEstimateSchema } from "./openapi-cost-estimate-components";
import { publicIdSchema } from "./openapi-public-id";
import { rankRunSchemas } from "./openapi-rank-run-components";
import { savedViewInputSchema, savedViewSchema } from "./openapi-saved-views";
import { openEnum } from "./openapi-sdk-schema";

const dateTime = { format: "date-time", type: "string" } as const;

const notificationPreferenceProperties = {
  alert_email: { type: "boolean" },
  alert_in_app: { type: "boolean" },
  alert_push: {
    description: "Mobile push for fired alerts on this member's registered devices.",
    type: "boolean",
  },
  alert_slack: { type: "boolean" },
  alert_webhook: { type: "boolean" },
  check_email: { type: "boolean" },
  check_in_app: { type: "boolean" },
  import_email: { type: "boolean" },
  import_in_app: { type: "boolean" },
  invite_email: { type: "boolean" },
  invite_in_app: { type: "boolean" },
};
const notificationPreferenceRequired = [
  "alert_email",
  "alert_in_app",
  "alert_push",
  "alert_slack",
  "alert_webhook",
  "check_email",
  "check_in_app",
  "import_email",
  "import_in_app",
  "invite_email",
  "invite_in_app",
];

export const resourceSchemas = {
  ...rankRunSchemas,
  AlertRule: alertRuleSchema,
  Capability: {
    description: "One operation in the public capability catalog.",
    properties: {
      description: { type: "string" },
      input_schema: {
        additionalProperties: true,
        description: "JSON Schema for the operation input.",
        type: "object",
      },
      mcp_tool: {
        description: "MCP tool name, or null when no MCP tool exposes the operation.",
        type: ["string", "null"],
      },
      name: { type: "string" },
      operationId: { type: "string" },
    },
    required: ["description", "input_schema", "mcp_tool", "name", "operationId"],
    type: "object",
  },
  ...competitorSchemas,
  CostEstimate: costEstimateSchema,
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
  NotificationPreferencesPatch: {
    properties: notificationPreferenceProperties,
    additionalProperties: false,
    type: "object",
  },
  NotificationPreferencesUpdated: {
    properties: {
      ...notificationPreferenceProperties,
      project_id: publicIdSchema("prj"),
      report_email: { type: "boolean" },
    },
    required: [...notificationPreferenceRequired, "project_id", "report_email"],
    type: "object",
  },
  NotificationPreferences: {
    properties: {
      ...notificationPreferenceProperties,
      report_email: { type: "boolean" },
      project_id: publicIdSchema("prj"),
      email: { type: "string", format: "email" },
      email_verification: {
        enum: ["unverified", "verified"],
        type: "string",
        ...openEnum("NotificationEmailVerification"),
      },
      slack_available: { type: "boolean" },
      webhook_available: { type: "boolean" },
    },
    required: [
      ...notificationPreferenceRequired,
      "report_email",
      "project_id",
      "email",
      "email_verification",
      "slack_available",
      "webhook_available",
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
  TriggeredAlert: triggeredAlertSchema,
} as const;
