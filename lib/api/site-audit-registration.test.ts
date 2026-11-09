import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";
import { operationPolicyForRequest } from "./operation-policy";

type OpenApiOperationView = {
  operationId?: string;
  parameters?: Array<{ in?: string; name?: string }>;
  requestBody?: unknown;
  responses?: Record<string, unknown>;
};

function operationAt(path: string, method: string) {
  const paths = getOpenApiDocument().paths as unknown as Record<
    string,
    Record<string, OpenApiOperationView>
  >;
  return paths[path]?.[method];
}

describe("site audit worker route registration", () => {
  it.each([
    ["GET", "run", "getSiteAuditRun", "read"],
    ["GET", "pages", "listSiteAuditPages", "read"],
    ["POST", "cancel", "cancelSiteAuditRun", "write"],
    ["POST", "resume", "resumeSiteAuditRun", "write"],
  ])(
    "registers %s %s with its token scope and OpenAPI response",
    (method, action, operationId, scope) => {
      expect(
        operationPolicyForRequest(method, [
          "projects",
          "prj_one",
          "site-audits",
          "agr_one",
          action,
        ]),
      ).toMatchObject({ operationId, requiredScope: scope });
      const path = `/projects/{project_id}/site-audits/{report_id}/${action}`;
      const operation = operationAt(path, method.toLowerCase());
      expect(operation).toMatchObject({ operationId, responses: { "200": expect.anything() } });
      if (!operation?.parameters) throw new Error(`Missing OpenAPI operation ${path}`);
      expect(
        operation.parameters
          .filter(
            (p): p is { in: "path"; name: string } =>
              "in" in p && p.in === "path" && "name" in p && typeof p.name === "string",
          )
          .map((p) => p.name),
      ).toEqual(["project_id", "report_id"]);
      if (method === "POST") expect(operation).not.toHaveProperty("requestBody");
    },
  );

  it("documents bounded page query parameters", () => {
    const operation = operationAt("/projects/{project_id}/site-audits/{report_id}/pages", "get");
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "offset",
          in: "query",
          schema: expect.objectContaining({ minimum: 0, maximum: 100_000 }),
        }),
        expect.objectContaining({
          name: "limit",
          in: "query",
          schema: expect.objectContaining({ minimum: 1, maximum: 100 }),
        }),
      ]),
    );
  });
});
