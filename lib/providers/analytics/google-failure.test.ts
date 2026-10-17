import { classifyProviderFailure } from "@/lib/providers/failure-class";
import { expect, it } from "vitest";
import { googlePropertyFailure, googleResponseError } from "./google-failure";

it.each([
  [403, "SERVICE_DISABLED", "api_disabled", "configure_api", "config_invalid"],
  [403, "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "scope", "reauthorize", "provider_4xx"],
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
