import { describe, expect, it } from "vitest";
import { withRequiredBody } from "./openapi-operations";

describe("withRequiredBody", () => {
  it("marks an existing request body as required", () => {
    expect(withRequiredBody({ requestBody: { content: { "application/json": {} } } })).toEqual({
      requestBody: { content: { "application/json": {} }, required: true },
    });
  });

  it("leaves operations without request bodies unchanged", () => {
    const operation = { responses: {} };

    expect(withRequiredBody(operation)).toBe(operation);
  });
});

it("documents subscription refusal for paid operations and site audits only", async () => {
  const { getOpenApiDocument } = await import("./openapi");
  const { operationSpend } = await import("./operation-provider-spend");
  const document = getOpenApiDocument();
  const operations = Object.values(document.paths).flatMap((path) => Object.values(path));
  for (const value of operations) {
    const operation = value as {
      operationId?: string;
      responses?: Record<string, { description: string; content: object }>;
    };
    if (!operation.operationId || !operation.responses?.["403"]) continue;
    const paid =
      Boolean(operationSpend(operation.operationId)) || operation.operationId === "runSiteAudit";
    const forbidden = JSON.stringify(operation.responses["403"]);
    expect(forbidden.includes("#/components/schemas/SubscriptionRequiredProblem")).toBe(paid);
    if (paid) expect(operation.responses["403"].description).toContain("subscription_required");
  }
  expect(document.components.schemas).toHaveProperty("SubscriptionRequiredProblem");
});
