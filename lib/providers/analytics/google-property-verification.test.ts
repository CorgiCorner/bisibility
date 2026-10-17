import { verifyProviderConnectionBeforeSave } from "@/lib/api/provider-verification";
import type { ProviderCatalogItem } from "@/lib/providers/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { googlePropertyFailure } from "./google-failure";

vi.mock("@/lib/providers/registry", async () => {
  const { ga4AnalyticsProvider } = await import("./ga4");
  const { gscAnalyticsProvider } = await import("./gsc");
  return {
    getAnalyticsProvider: (id: string) =>
      id === "ga4" ? ga4AnalyticsProvider : gscAnalyticsProvider,
  };
});
beforeEach(() => {
  vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "1");
  vi.stubEnv("GOOGLE_CLIENT_ID", "fixture-client");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "fixture-secret");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it.each([
  ["ga4", 403, "SERVICE_DISABLED", "api_disabled", "configure_api"],
  ["ga4", 403, "RATE_LIMIT_EXCEEDED", "quota", "retry_later"],
  ["ga4", 403, "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "scope", "reauthorize"],
  ["ga4", 401, "UNAUTHENTICATED", "auth", "reconnect"],
  ["gsc", 403, "PERMISSION_DENIED", "permission", "check_permissions"],
] as const)(
  "keeps %s final probe %s/%s safe and typed through verification",
  async (id, status, code, reason, action) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        const host = new URL(String(url)).host;
        if (host === "oauth2.googleapis.com")
          return Response.json({ access_token: "fixture_access" });
        if (["analyticsdata.googleapis.com", "www.googleapis.com"].includes(host)) {
          return Response.json(
            {
              error: {
                status: "PERMISSION_DENIED",
                details: [{ reason: code, metadata: { token: "fixture_secret" } }],
                message: "fixture_secret account@example.com",
              },
            },
            { status },
          );
        }
        throw new Error("Unexpected network request blocked");
      }),
    );
    const provider = {
      id,
      kind: "analytics",
      label: id,
      defaultStatus: "optional",
      requiredCredentials: ["apiKey", "login"],
    } satisfies ProviderCatalogItem;
    const error = await verifyProviderConnectionBeforeSave({
      credentials: {
        apiKey: "fixture_refresh",
        login: id === "ga4" ? "123456789" : "sc-domain:example.com",
      },
      hasStoredCredentials: true,
      projectId: "fixture_project",
      provider,
    }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect(googlePropertyFailure(error)).toEqual({ reason, action, httpStatus: status, code });
    expect(JSON.stringify(error)).not.toMatch(
      /fixture_secret|fixture_access|fixture_refresh|account@example/,
    );
    expect(String(error)).not.toMatch(/fixture_secret|account@example/);
  },
);
