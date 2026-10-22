import { OWN_KEY_CAPABILITIES } from "@/lib/providers/own-key-capabilities";
import { publicIdSchema } from "./openapi-public-id";
import { scheduleInputContractSchema } from "./openapi-schedule-schema";
import { closedEnum, constraintUnion, openEnum, sdkName } from "./openapi-sdk-schema";

export const personalAccessSchemas = {
  Me: {
    properties: {
      email: { format: "email", type: "string" },
      id: publicIdSchema("usr"),
      name: { type: "string" },
      projects: {
        items: {
          properties: {
            domain: { type: "string" },
            id: publicIdSchema("prj"),
            missing_provider_keys: {
              description:
                "Paid capabilities this project cannot run on its own provider keys, each with the providers that would serve it. Empty unless `provider_keys_required` is true. Connect a key in the project's Integrations settings on the web.",
              items: {
                properties: {
                  capability: {
                    enum: [...OWN_KEY_CAPABILITIES],
                    type: "string",
                    ...openEnum("OwnKeyCapability"),
                  },
                  providers: { items: { type: "string" }, type: "array" },
                },
                required: ["capability", "providers"],
                type: "object",
                ...sdkName("MissingProviderKey"),
              },
              type: "array",
            },
            name: { type: "string" },
            provider_keys_required: {
              description:
                "True when the project's owner account runs paid provider work only on its own provider keys. A paid request without a usable own key fails with the `byok_required` problem type before any provider call.",
              type: "boolean",
            },
            role: {
              enum: ["admin", "auditor", "member", "owner", "viewer"],
              type: "string",
              ...openEnum("ProjectRole"),
            },
          },
          required: [
            "id",
            "name",
            "domain",
            "role",
            "provider_keys_required",
            "missing_provider_keys",
          ],
          type: "object",
          ...sdkName("MeProject"),
        },
        type: "array",
      },
      provider_keys_required: {
        description:
          "True when this account runs paid provider work only on its own provider keys, connected in each project's Integrations settings on the web. Estimates remain free.",
        type: "boolean",
      },
    },
    required: ["id", "email", "name", "projects", "provider_keys_required"],
    type: "object",
  },
  DevicePushToken: {
    properties: {
      bundle_id: { type: "string" },
      created_at: { format: "date-time", type: "string" },
      environment: {
        enum: ["production", "sandbox"],
        type: "string",
        ...openEnum("DevicePushEnvironment"),
      },
      id: publicIdSchema("dpt"),
      last_seen_at: { format: "date-time", type: "string" },
      token_suffix: {
        description: "Last 8 characters of the token; the token itself is never returned.",
        type: "string",
      },
    },
    required: ["id", "bundle_id", "environment", "created_at", "last_seen_at", "token_suffix"],
    type: "object",
  },
  DevicePushTokenRegister: {
    additionalProperties: false,
    properties: {
      bundle_id: {
        description: "App bundle identifier, for example com.bisibility.app.",
        minLength: 1,
        pattern: "^[A-Za-z0-9-]+(\\.[A-Za-z0-9-]+)+$",
        maxLength: 155,
        type: "string",
      },
      environment: {
        description: "APNs environment of the build: sandbox for development builds.",
        ...closedEnum("DevicePushEnvironmentInput"),
        enum: ["production", "sandbox"],
        type: "string",
      },
      token: {
        description: "APNs device token as hexadecimal.",
        pattern: "^[0-9A-Fa-f]{32,200}$",
        type: "string",
      },
    },
    required: ["token", "environment", "bundle_id"],
    type: "object",
  },
  MeDelete: {
    additionalProperties: false,
    description: "Confirms account deletion with the account's email address.",
    properties: { confirm_email: { maxLength: 320, minLength: 3, type: "string" } },
    required: ["confirm_email"],
    type: "object",
  },
  MeDeleted: {
    properties: { deleted: { const: true, type: "boolean" } },
    required: ["deleted"],
    type: "object",
  },
  MePatch: {
    properties: { name: { maxLength: 120, minLength: 1, type: "string" } },
    required: ["name"],
    type: "object",
  },
  PersonalAccessToken: {
    properties: {
      created_at: { format: "date-time", type: "string" },
      expires_at: { format: "date-time", type: ["string", "null"] },
      id: publicIdSchema("pat"),
      last_used_at: { format: "date-time", type: ["string", "null"] },
      name: { type: "string" },
      prefix: { example: "bsb_pat_live_xxxxxxxx", type: "string" },
      revoked_at: { format: "date-time", type: ["string", "null"] },
      scope: { enum: ["admin", "read", "write"], type: "string" },
    },
    required: [
      "id",
      "name",
      "prefix",
      "scope",
      "created_at",
      "expires_at",
      "last_used_at",
      "revoked_at",
    ],
    type: "object",
  },
  PersonalAccessTokenCreate: {
    properties: {
      expires_in_days: { enum: [30, 90, 365, null], type: ["integer", "null"] },
      name: { maxLength: 80, minLength: 1, type: "string" },
      scope: { default: "read", enum: ["admin", "read", "write"], type: "string" },
    },
    required: ["name"],
    type: "object",
  },
  PersonalAccessTokenIssued: {
    allOf: [
      { $ref: "#/components/schemas/PersonalAccessToken" },
      {
        properties: {
          masked_value: { type: "string" },
          token: { example: "bsb_pat_live_...", type: "string" },
        },
        required: ["masked_value", "token"],
        type: "object",
      },
    ],
  },
  ProjectPatch: {
    properties: {
      domain: { minLength: 1, maxLength: 253, type: "string" },
      name: { minLength: 1, maxLength: 120, type: "string" },
    },
    type: "object",
    anyOf: [{ required: ["domain"] }, { required: ["name"] }],
    ...constraintUnion,
  },
  ProjectCreate: {
    properties: {
      defaults: {
        ...scheduleInputContractSchema,
        ...sdkName("ProjectCreateDefaults"),
        properties: {
          ...scheduleInputContractSchema.properties,
          frequency: {
            ...scheduleInputContractSchema.properties.frequency,
            ...closedEnum("ProjectCreateFrequency"),
          },
          cron_expression: { minLength: 1, maxLength: 120, type: ["string", "null"] },
          timezone: { minLength: 1, maxLength: 80, type: "string", default: "UTC" },
          serp_depth: {
            enum: [10, 20, 50, 100],
            type: "integer",
            ...closedEnum("ProjectCreateSerpDepth"),
          },
        },
      },
      domain: { minLength: 1, maxLength: 253, type: "string" },
      name: { minLength: 1, maxLength: 120, type: "string" },
      tracking_scope: {
        enum: ["city", "country"],
        type: "string",
        ...closedEnum("ProjectCreateTrackingScope"),
      },
    },
    required: ["name", "domain"],
    type: "object",
  },
  WebhookEndpoint: {
    properties: {
      created_at: { format: "date-time", type: "string" },
      description: { type: ["string", "null"] },
      enabled: { type: "boolean" },
      id: publicIdSchema("we"),
      last_delivery_at: { format: "date-time", type: ["string", "null"] },
      updated_at: { format: "date-time", type: "string" },
      url: { format: "uri", type: "string" },
    },
    required: [
      "id",
      "url",
      "description",
      "enabled",
      "last_delivery_at",
      "created_at",
      "updated_at",
    ],
    type: "object",
  },
  WebhookEndpointCreate: {
    properties: {
      description: { type: ["string", "null"] },
      enabled: { default: true, type: "boolean" },
      hmac_secret: { minLength: 16, type: "string", writeOnly: true },
      url: { format: "uri", type: "string" },
    },
    required: ["url", "hmac_secret"],
    type: "object",
  },
  WebhookEndpointPatch: {
    properties: {
      description: { type: ["string", "null"] },
      enabled: { type: "boolean" },
      hmac_secret: { minLength: 16, type: "string", writeOnly: true },
      url: { format: "uri", type: "string" },
    },
    type: "object",
  },
} as const;
