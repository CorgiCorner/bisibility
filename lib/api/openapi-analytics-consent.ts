import { personalAccessTokenSecurity } from "./openapi-pat";

export const accountAnalyticsConsentSchema = {
  type: "object",
  additionalProperties: false,
  required: ["analytics", "decided_at", "source", "version"],
  properties: {
    analytics: { type: "boolean" },
    decided_at: { type: ["string", "null"], format: "date-time" },
    source: { type: ["string", "null"], enum: ["web", "ios", "api", null] },
    version: { type: "integer", minimum: 1 },
  },
} as const;

const response = {
  "200": {
    description: "Account analytics consent; a null decision means pending.",
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/AccountAnalyticsConsent" } },
    },
  },
  "401": { description: "Authentication required" },
  "403": { description: "Insufficient token scope" },
};

export const accountAnalyticsConsentPaths = {
  "/me/analytics-consent": {
    get: {
      operationId: "getAnalyticsConsent",
      summary: "Read account analytics consent",
      description: "Replay permission is local to the browser and is not returned here.",
      security: personalAccessTokenSecurity,
      responses: response,
    },
    put: {
      operationId: "updateAnalyticsConsent",
      summary: "Set account analytics consent",
      description:
        "Idempotently stores an explicit decision. Does not change browser replay permission.",
      security: personalAccessTokenSecurity,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["analytics"],
              properties: { analytics: { type: "boolean" } },
            },
          },
        },
      },
      responses: { ...response, "400": { description: "Invalid consent decision" } },
    },
  },
};
