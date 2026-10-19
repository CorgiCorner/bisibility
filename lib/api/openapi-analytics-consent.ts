import { personalAccessTokenSecurity } from "./openapi-pat";
import { problemResponse } from "./openapi-problem";
import { openEnum, sdkName } from "./openapi-sdk-schema";

export const accountAnalyticsConsentSchema = {
  type: "object",
  required: ["analytics", "decided_at", "source", "version"],
  properties: {
    analytics: { type: "boolean" },
    decided_at: { type: ["string", "null"], format: "date-time" },
    source: {
      type: ["string", "null"],
      enum: ["web", "ios", "api", null],
      ...openEnum("AnalyticsConsentSource"),
    },
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
  "401": problemResponse("Authentication required"),
  "403": problemResponse("Insufficient token scope or an unsupported third-party client"),
  "404": problemResponse("This route requires a personal token or app OAuth token"),
  "429": problemResponse("Rate limited"),
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
      parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
      summary: "Set account analytics consent",
      description:
        "Idempotently stores an explicit decision. Does not change browser replay permission.",
      security: personalAccessTokenSecurity,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              ...sdkName("AnalyticsConsentUpdate"),
              type: "object",
              additionalProperties: false,
              required: ["analytics"],
              properties: { analytics: { type: "boolean" } },
            },
          },
        },
      },
      responses: { ...response, "400": problemResponse("Invalid consent decision") },
    },
  },
};
