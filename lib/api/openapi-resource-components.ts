import {
  CHECK_NOTIFICATION_POSITION_MOVE,
  CHECK_NOTIFICATION_SETTINGS,
  CHECK_NOTIFICATION_TOP_N,
} from "@/lib/notifications/preference-defaults";
import { alertRuleSchema, triggeredAlertSchema } from "./openapi-alert-response-components";
import { competitorSchemas } from "./openapi-competitor-components";
import { costEstimateSchema } from "./openapi-cost-estimate-components";
import { publicIdSchema } from "./openapi-public-id";
import { rankRunSchemas } from "./openapi-rank-run-components";
import { savedViewInputSchema, savedViewSchema } from "./openapi-saved-views";
import { closedEnum, openEnum } from "./openapi-sdk-schema";

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
  check_in_app: {
    deprecated: true,
    description:
      "Read-only compatibility value: false only for None, true otherwise. Ignored on writes; use check_notification_setting. Sending this field returns a Deprecation header and a warnings entry naming check_in_app.",
    type: "boolean",
  },
  provider_incident_in_app: { type: "boolean", default: true },
  check_notification_setting: {
    description:
      "Check summaries: all nonempty app windows, important changes only (default), or none. Manual app runs summarize under all and important.",
    enum: CHECK_NOTIFICATION_SETTINGS,
    type: "string",
    ...openEnum("CheckNotificationSetting"),
  },
  check_notification_top_n: {
    description: "Top-N entry or exit threshold. Default 10.",
    type: "integer",
    minimum: CHECK_NOTIFICATION_TOP_N.min,
    maximum: CHECK_NOTIFICATION_TOP_N.max,
  },
  check_notification_position_move: {
    description: "Inclusive position movement threshold. Default 5.",
    type: "integer",
    minimum: CHECK_NOTIFICATION_POSITION_MOVE.min,
    maximum: CHECK_NOTIFICATION_POSITION_MOVE.max,
  },
  import_email: { type: "boolean" },
  import_in_app: { type: "boolean" },
  invite_email: { type: "boolean" },
  invite_in_app: { type: "boolean" },
};

function ignoredProjectChannelField(channel: string, commands: string) {
  return {
    deprecated: true,
    description: `Project ${channel} delivery, not a personal preference. Ignored on writes; managers use ${commands}. Sending this field returns a Deprecation header and a warnings entry naming it.`,
    type: "boolean",
  } as const;
}

const notificationPreferenceRequired = [
  "alert_email",
  "alert_in_app",
  "alert_push",
  "alert_slack",
  "alert_webhook",
  "check_email",
  "check_in_app",
  "check_notification_setting",
  "check_notification_top_n",
  "check_notification_position_move",
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
    properties: {
      ...notificationPreferenceProperties,
      alert_slack: ignoredProjectChannelField("Slack", "the Slack channel commands"),
      alert_webhook: ignoredProjectChannelField("webhook", "the webhook endpoint commands"),
      check_notification_setting: {
        ...notificationPreferenceProperties.check_notification_setting,
        ...closedEnum("CheckNotificationSettingInput"),
      },
    },
    additionalProperties: false,
    type: "object",
  },
  NotificationPreferencesUpdated: {
    properties: {
      warnings: {
        description:
          "Present when a deprecated check_in_app, alert_slack or alert_webhook write was ignored. Also returned through MCP.",
        type: "array",
        items: {
          type: "object",
          properties: {
            code: { type: "string" },
            field: { type: "string" },
            message: { type: "string" },
          },
          required: ["code", "field", "message"],
          "x-bisibility-name": "NotificationPreferenceWarning",
        },
      },
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
