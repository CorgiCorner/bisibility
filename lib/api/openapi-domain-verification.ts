import { closedEnum, openEnum } from "./openapi-sdk-schema";

type Bearer = (
  summary: string,
  operationId: string,
  schema: object,
  requestSchema?: object,
  parameters?: object[],
  options?: { requestRequired?: boolean },
) => object;
export const domainVerificationSchemas = {
  DomainVerificationInput: {
    type: "object",
    additionalProperties: false,
    required: ["method"],
    properties: {
      method: {
        type: "string",
        enum: ["dns_txt", "search_console"],
        ...closedEnum("DomainVerificationMethodInput"),
      },
    },
  },
  DomainVerification: {
    type: "object",
    additionalProperties: false,
    required: [
      "domain",
      "method",
      "dns_host",
      "dns_value",
      "verified_at",
      "last_checked_at",
      "last_check_result",
      "failures",
      "revoked_at",
    ],
    properties: {
      domain: { type: "string" },
      method: {
        type: "string",
        enum: ["dns_txt", "search_console"],
        ...openEnum("DomainVerificationMethod"),
      },
      dns_host: { type: "string" },
      dns_value: { type: "string" },
      verified_at: {
        type: ["string", "null"],
        format: "date-time",
        description:
          "Last successful proof time. Null when revoked, outside the current host scope, or 72 hours old. Failed checks do not extend validity.",
      },
      last_checked_at: { type: ["string", "null"], format: "date-time" },
      revoked_at: { type: ["string", "null"], format: "date-time" },
      last_check_result: { type: ["string", "null"] },
      failures: { type: "integer", minimum: 0 },
    },
  },
  DomainVerificationResponse: {
    type: "object",
    additionalProperties: false,
    required: ["data"],
    properties: {
      data: { anyOf: [{ $ref: "#/components/schemas/DomainVerification" }, { type: "null" }] },
    },
  },
};
export function domainVerificationPaths(bearer: Bearer) {
  const response = { $ref: "#/components/schemas/DomainVerificationResponse" };
  return {
    "/projects/{project_id}/domain-verification": {
      get: bearer("Read project domain verification", "getDomainVerification", response),
      post: bearer(
        "Start project domain verification",
        "issueDomainVerification",
        response,
        { $ref: "#/components/schemas/DomainVerificationInput" },
        undefined,
        { requestRequired: true },
      ),
    },
    "/projects/{project_id}/domain-verification/check": {
      post: bearer("Check project domain verification", "checkDomainVerification", response),
    },
  };
}
