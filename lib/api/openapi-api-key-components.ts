import { apiKeyCreateProperties } from "./api-key-contract";

export const apiKeySchemas = {
  ApiKey: {
    properties: {
      created_at: { format: "date-time", type: "string" },
      expires_at: { format: "date-time", type: ["string", "null"] },
      id: {
        example: "key_a00000000000000000000000",
        pattern: "^key_[a-z][a-z0-9]{23}$",
        type: "string",
      },
      last_used_at: { type: ["string", "null"], format: "date-time" },
      name: { type: "string" },
      prefix: { example: "bsb_key_live_xxxxxxxx", type: "string" },
      revoked_at: { type: ["string", "null"], format: "date-time" },
      scope: { enum: ["read", "write", "admin"], type: "string" },
    },
    required: [
      "id",
      "name",
      "prefix",
      "created_at",
      "expires_at",
      "last_used_at",
      "revoked_at",
      "scope",
    ],
    type: "object",
  },
  ApiKeyCreate: {
    properties: apiKeyCreateProperties,
    required: ["name"],
    type: "object",
  },
  ApiKeyIssued: {
    allOf: [
      { $ref: "#/components/schemas/ApiKey" },
      {
        properties: {
          masked_value: { type: "string" },
          token: { example: "bsb_key_live_...", type: "string" },
        },
        required: ["masked_value", "token"],
        type: "object",
      },
    ],
  },
};
