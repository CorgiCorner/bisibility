import { paymentRequestFields } from "./openapi-action-payment";
import { backlinksEstimateSchema } from "./openapi-backlinks-parts";
import { closedEnum, sdkName, taggedUnion, usdCents } from "./openapi-sdk-schema";

export const backlinksRowsSchemas = {
  BacklinksRowsEstimate: {
    ...backlinksEstimateSchema,
    description:
      "Upper bound for the next page at the requested limit. Zero when that page is already retained. No provider request or snapshot mutation occurs.",
  },
  BacklinksRowsResponse: {
    type: "object",
    required: ["data"],
    properties: {
      data: {
        oneOf: [
          { $ref: "#/components/schemas/BacklinksRowsEstimate" },
          { $ref: "#/components/schemas/BacklinksSnapshot" },
        ],
        ...sdkName("BacklinksRowsResult"),
        ...taggedUnion("estimate", ["estimate", "snapshot"]),
      },
    },
  },
  BacklinksRowsRequest: {
    properties: {
      ...paymentRequestFields,
      estimate_only: {
        type: "boolean",
        description: "Return the next-page estimate without provider I/O or changing the snapshot.",
      },
      max_cost_cents: {
        type: "integer",
        minimum: 0,
        ...usdCents,
        description:
          "Optional upper bound on the admitted next-page cost estimate. 0 = cached result only; a cache miss returns cost_limit_exceeded with estimated_cost_cents before paid work.",
      },
      snapshot_ref: {
        minLength: 1,
        maxLength: 32768,
        type: "string",
        description:
          "Opaque snapshot_ref from the report being extended. Missing or stale references return snapshot_expired before paid I/O.",
      },
      include_subdomains: { type: "boolean" },
      limit: { maximum: 1000, minimum: 100, multipleOf: 100, type: "integer" },
      target: { minLength: 1, type: "string" },
      target_scope: {
        enum: ["site", "page"],
        type: "string",
        ...closedEnum("BacklinksRowsTargetScope"),
      },
    },
    required: ["target", "target_scope", "include_subdomains", "limit"],
    type: "object",
  },
};
