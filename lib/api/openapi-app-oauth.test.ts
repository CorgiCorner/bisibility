import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";

type Operation = { operationId: string; security?: Record<string, string[]>[] };

function operations() {
  const document = getOpenApiDocument() as unknown as {
    paths: Record<string, Record<string, Operation>>;
  };
  return Object.values(document.paths).flatMap((methods) => Object.values(methods));
}

function appScopes(operationId: string) {
  const operation = operations().find((candidate) => candidate.operationId === operationId);
  return operation?.security?.find((entry) => "AppOAuth" in entry)?.AppOAuth ?? null;
}

describe("app OAuth in the OpenAPI document", () => {
  it("declares the authorization code flow with the two app scopes", () => {
    const scheme = (
      getOpenApiDocument().components.securitySchemes as Record<string, Record<string, unknown>>
    ).AppOAuth;
    expect(scheme).toMatchObject({
      flows: {
        authorizationCode: {
          authorizationUrl: "/api/auth/oauth2/authorize",
          refreshUrl: "/api/auth/oauth2/token",
          scopes: { "api:read": expect.any(String), "api:write": expect.any(String) },
          tokenUrl: "/api/auth/oauth2/token",
        },
      },
      type: "oauth2",
    });
  });

  it("maps app scopes, including deletion, without granting token administration", () => {
    expect(appScopes("getMe")).toEqual(["api:read"]);
    expect(appScopes("createProject")).toEqual(["api:write"]);
    expect(appScopes("deleteMe")).toEqual(["api:write"]);
    expect(appScopes("createPersonalAccessToken")).toBeNull();
    expect(appScopes("createApiKey")).toBeNull();
    for (const operation of operations()) {
      const security = operation.security ?? [];
      const app = security.some((entry) => "AppOAuth" in entry);
      if (app) expect(security.some((entry) => "PersonalAccessToken" in entry)).toBe(true);
    }
  });
});
