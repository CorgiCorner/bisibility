import { classifyProviderFailure } from "@/lib/providers/failure-class";
import { expect, it } from "vitest";
import {
  googleFailureDiagnostic,
  googlePropertyFailure,
  googleResponseError,
} from "./google-failure";

it.each([
  [403, "SERVICE_DISABLED", "api_disabled", "configure_api", "config_invalid"],
  [403, "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "scope", "reauthorize", "config_invalid"],
  [403, "RATE_LIMIT_EXCEEDED", "quota", "retry_later", "rate_limit"],
  [429, "RESOURCE_EXHAUSTED", "quota", "retry_later", "rate_limit"],
  [401, "UNAUTHENTICATED", "auth", "reconnect", "auth"],
  [400, "invalid_grant", "auth", "reconnect", "auth"],
  [401, "invalid_grant", "auth", "reconnect", "auth"],
  [401, "invalid_client", "configuration", "configure_api", "config_invalid"],
  [401, "unauthorized_client", "configuration", "configure_api", "config_invalid"],
] as const)(
  "keeps safe %s/%s diagnostics and actions without raw metadata",
  (status, code, reason, action, failureClass) => {
    const error = googleResponseError(status, {
      error:
        code === "invalid_grant"
          ? code
          : {
              status: status === 403 ? "PERMISSION_DENIED" : code,
              message:
                "access_secret refresh_secret account@example.com Authorization: Bearer secret",
              details: [{ reason: code, metadata: { access_token: "access_secret" } }],
            },
      error_description: "refresh_secret",
    });
    expect(googlePropertyFailure(error)).toEqual({ reason, action, httpStatus: status, code });
    expect(classifyProviderFailure(error)).toBe(failureClass);
    expect(String(error)).not.toMatch(/secret|account@example/);
    expect(JSON.stringify(error)).not.toMatch(/secret|account@example/);
  },
);

it("drops unrecognized diagnostic codes instead of echoing provider text", () => {
  const error = googleResponseError(403, {
    error: { errors: [{ reason: "refresh_secret" }], message: "access_secret" },
  });
  expect(googlePropertyFailure(error)).toEqual({
    reason: "permission",
    action: "check_permissions",
    httpStatus: 403,
  });
  expect(JSON.stringify(error)).not.toContain("secret");
});

it("preserves invalid-property classification without storing the raw provider message", () => {
  const error = googleResponseError(400, {
    error: { message: "Invalid property identifier: access_secret" },
  });
  expect(classifyProviderFailure(error)).toBe("config_invalid");
  expect(String(error)).not.toContain("access_secret");
});

it.each([
  [
    "forbidden",
    403,
    { error: { errors: [{ reason: "forbidden" }], message: "x" } },
    "config_invalid",
    "permission",
  ],
  [
    "PERMISSION_DENIED",
    403,
    { error: { status: "PERMISSION_DENIED", message: "x" } },
    "config_invalid",
    "permission",
  ],
  ["no body", 403, null, "config_invalid", "permission"],
  [
    "scope",
    403,
    {
      error: {
        status: "PERMISSION_DENIED",
        details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }],
      },
    },
    "config_invalid",
    "scope",
  ],
  [
    "rateLimitExceeded",
    403,
    { error: { status: "PERMISSION_DENIED", errors: [{ reason: "rateLimitExceeded" }] } },
    "rate_limit",
    "quota",
  ],
  [
    "dailyLimitExceeded",
    403,
    { error: { errors: [{ reason: "dailyLimitExceeded" }] } },
    "rate_limit",
    "quota",
  ],
  [
    "accessNotConfigured",
    403,
    { error: { status: "PERMISSION_DENIED", errors: [{ reason: "accessNotConfigured" }] } },
    "config_invalid",
    "api_disabled",
  ],
  ["401", 401, { error: { status: "UNAUTHENTICATED" } }, "auth", "auth"],
  ["invalid_grant", 400, { error: "invalid_grant" }, "auth", "auth"],
  ["5xx", 503, null, "provider_5xx", "temporary"],
  [
    "400 without a permission signal",
    400,
    { error: { message: "Bad request" } },
    "provider_4xx",
    "unknown",
  ],
  ["404", 404, null, "provider_4xx", "unknown"],
] as const)(
  "classifies a Google data API %s failure",
  (_name, status, payload, failureClass, reason) => {
    const error = googleResponseError(status, payload, "gsc");
    expect(classifyProviderFailure(error)).toBe(failureClass);
    expect(googleFailureDiagnostic(error)).toMatchObject({
      googleReason: reason,
      httpStatus: status,
    });
  },
);

it("keeps the stored diagnostic to allowlisted vocabulary", () => {
  const error = googleResponseError(403, {
    error: {
      errors: [{ reason: "insufficientPermissions", domain: "sc-domain:private.example" }],
      message: "User account@example.com lacks access to https://private.example/ token=secret",
    },
  });
  expect(googleFailureDiagnostic(error)).toEqual({
    googleCode: "insufficientPermissions",
    googleReason: "permission",
    httpStatus: 403,
  });
  expect(googleFailureDiagnostic(new Error("token=secret"))).toBeUndefined();
});
