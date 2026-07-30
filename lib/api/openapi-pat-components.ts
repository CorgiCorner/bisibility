import { publicIdSchema } from "./openapi-public-id";
import { scheduleInputContractSchema } from "./openapi-schedule-schema";

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
            name: { type: "string" },
            role: { enum: ["admin", "auditor", "member", "owner", "viewer"], type: "string" },
          },
          required: ["id", "name", "domain", "role"],
          type: "object",
        },
        type: "array",
      },
    },
    required: ["id", "email", "name", "projects"],
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
  ProjectCreate: {
    properties: {
      defaults: scheduleInputContractSchema,
      domain: { type: "string" },
      name: { type: "string" },
      tracking_scope: { enum: ["city", "country"], type: "string" },
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
