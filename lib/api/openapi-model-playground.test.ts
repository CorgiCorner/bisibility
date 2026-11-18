import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  modelPlaygroundAppOnlyOperations,
  modelPlaygroundPolicies,
} from "./model-playground-registry";
import { getOpenApiDocument } from "./openapi";
import { providerSchemas } from "./openapi-provider-components";
import { evaluateRequestConformance } from "./openapi-request-conformance.test-support";
import { blockingSubjects, evaluateSdkExtensions } from "./openapi-sdk-lint.test-support";
import type { SdkDocument } from "./openapi-sdk-lint-schema.test-support";
import { operationInputs } from "./operation-input-registry";

it("registers all five operations with conforming requests and SDK metadata", () => {
  const document = getOpenApiDocument();
  const requests = evaluateRequestConformance(document, operationInputs);
  const sdk = evaluateSdkExtensions(document as unknown as SdkDocument);
  for (const [id, policy] of Object.entries(modelPlaygroundPolicies)) {
    const operation = (document.paths as Record<string, Record<string, Record<string, unknown>>>)[
      policy.path
    ][policy.method.toLowerCase()];
    expect(operation.operationId).toBe(id);
    expect(requests.filter((entry) => entry.operation === id)).toEqual([]);
    const blocked = blockingSubjects(sdk, id);
    expect(sdk.filter((entry) => blocked.includes(entry.subject))).toEqual([]);
    expect(operation["x-bisibility-cost"]).toEqual(
      id === "createModelPlaygroundRun"
        ? { kind: "paid", timing: "deferred", payer: "customer_provider" }
        : { kind: "free" },
    );
  }
  expect(modelPlaygroundAppOnlyOperations).toEqual(["saveModelPlaygroundPreset"]);
});
it("opens provider kind and category without changing the existing values or order", () => {
  for (const schema of [
    providerSchemas.Provider.properties.kind,
    providerSchemas.Provider.properties.category_id,
  ]) {
    expect(schema.enum).toEqual(["serp", "analytics", "model"]);
    expect(schema["x-bisibility-enum"]).toBe("open");
  }
});
it("keeps REST inputs own-key and reads both stored funding sources without wallet fields", () => {
  const document = getOpenApiDocument();
  const schemas = Object.entries(document.components.schemas).filter(([name]) =>
    name.startsWith("ModelPlayground"),
  );
  expect(schemas).toHaveLength(7);
  const estimate = document.components.schemas.ModelPlaygroundEstimate as {
    properties: Record<string, unknown>;
    required: string[];
  };
  expect(Object.keys(estimate.properties).sort()).toEqual([
    "budget_available",
    "estimated_at",
    "forecasts",
    "version",
  ]);
  expect(estimate.properties.budget_available).toEqual({ type: "boolean" });
  expect(estimate.properties.forecasts).toMatchObject({
    items: {
      properties: {
        money: { "x-bisibility-union": { tag: "certainty", cases: ["estimated", "unknown"] } },
      },
    },
  });
  expect(document.components.schemas.ModelPlaygroundPreview).toMatchObject({
    properties: {
      forecasts: {
        items: {
          properties: {
            money: {
              "x-bisibility-union": { tag: "certainty", cases: ["estimated", "unknown"] },
              oneOf: [
                {
                  properties: {
                    amount: { type: "string" },
                    certainty: { const: "estimated" },
                    basis: { const: "rate_card" },
                  },
                },
                {
                  properties: {
                    amount: { type: "null" },
                    certainty: { const: "unknown" },
                    basis: { const: "unknown" },
                  },
                },
              ],
            },
          },
        },
      },
    },
  });
  const storedColumn = {
    properties: {
      connection_id: {
        pattern: "^(?:conn_[a-z][a-z0-9]{23}|platform:(?:openai|anthropic|openrouter))$",
      },
      payment: { properties: { funding_source: { enum: ["byok", "platform"] } } },
    },
  };
  expect(document.components.schemas.ModelPlaygroundRun).toMatchObject({
    properties: {
      columns: {
        items: {
          properties: {
            column: storedColumn,
            result: {
              anyOf: [{ properties: { column: storedColumn } }, { type: "null" }],
            },
          },
        },
      },
    },
  });
  expect(document.components.schemas.ModelPlaygroundPreviewInput).toMatchObject({
    properties: {
      columns: {
        items: {
          properties: {
            connection_id: { pattern: "^conn_[a-z][a-z0-9]{23}$" },
            payment: { properties: { funding_source: { const: "byok" } } },
          },
        },
      },
    },
  });
  const serialized = JSON.stringify(schemas);
  expect(serialized).not.toMatch(/wallet|hold|debit|credit|dataforseo|funding_bridge/i);
  expect(JSON.stringify(schemas.filter(([name]) => name !== "ModelPlaygroundRun"))).not.toMatch(
    /platform/i,
  );
  expect(serialized).toContain('"consulted_sources"');
  expect(serialized).toContain('"citation_totals"');
  expect(serialized).toContain('"cost_evidence"');
  expect(serialized).toContain('"routing_attempt_credentials"');
  expect(serialized).toContain('"resolved_workspace_id"');
  expect(serialized).toContain('"routing_violation"');
  expect(serialized).toContain('"workspace_id"');
  expect(serialized).toContain('"allowed_providers"');
});

it("reserves unique generated names for the widened provider enums", () => {
  const document = getOpenApiDocument();
  for (const name of ["ProviderKind", "ProviderCategoryId"]) {
    const found: unknown[] = [];
    function visit(value: unknown) {
      if (!value || typeof value !== "object") return;
      if ("x-bisibility-name" in value && value["x-bisibility-name"] === name) found.push(value);
      Object.values(value).forEach(visit);
    }
    visit(document);
    expect(found, name).toHaveLength(1);
    expect(document.components.schemas).not.toHaveProperty(name);
  }
});

it("declares receipt fields locally and uses that schema for results", () => {
  const receiptSource = readFileSync(
    new URL("./model-playground-receipt-schema.ts", import.meta.url),
    "utf8",
  );
  expect(receiptSource).toContain("modelPlaygroundOwnReceiptSchema = z");
  expect(receiptSource).not.toMatch(
    /actionPaymentReceiptSchema|actionPaymentOptionSchema|paymentUnitSchema|paymentAmountSchema|\.safeExtend|\.extend/,
  );
  const resultSource = readFileSync(
    new URL("./model-playground-schemas.ts", import.meta.url),
    "utf8",
  );
  expect(resultSource).toContain("paymentReceipt: modelPlaygroundOwnReceiptSchema.nullable()");
  expect(resultSource).not.toMatch(/actionPaymentReceiptSchema|actionPaymentOptionSchema/);
});

it("documents recovery through a new key and the same quote after cached failures", () => {
  const paths = getOpenApiDocument().paths as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  const operation = paths["/projects/{project_id}/model-playground/runs"].post;
  const responses = operation.responses as Record<string, { description: string }>;
  expect(operation.description).toContain("422");
  expect(operation.description).toContain("different body");
  expect(operation.description).toContain("identical body bytes");
  expect(responses["422"].description).toContain("validation_failed");
  expect(operation.description).toContain("identical body");
  expect(responses["500"].description).toContain("NEW Idempotency-Key");
  expect(responses["500"].description).toContain("same quote");
  expect(responses["500"].description).toContain("run_id");
  for (const text of [operation.description, responses["500"].description]) {
    for (const term of [
      "replayed=true",
      "replayed=false",
      "confirmation_required",
      "not_dispatched",
      "same confirm_unknown",
      "confirmation_spent",
    ])
      expect(text).toContain(term);
  }
  expect(responses["500"].description).not.toContain("Read the saved run");
  expect(responses["503"].description).toContain("NEW Idempotency-Key");
});

it("keeps receipt connection bounds and explicit unknown provider cost on the wire", () => {
  const run = getOpenApiDocument().components.schemas.ModelPlaygroundRun;
  expect(run).toMatchObject({
    properties: {
      columns: {
        items: {
          properties: {
            result: {
              anyOf: expect.arrayContaining([
                expect.objectContaining({
                  properties: expect.objectContaining({
                    payment_receipt: expect.objectContaining({
                      anyOf: expect.arrayContaining([
                        expect.objectContaining({
                          required: expect.arrayContaining(["provider_cost"]),
                          properties: expect.objectContaining({
                            option: expect.objectContaining({
                              properties: expect.objectContaining({
                                connection_id: expect.objectContaining({
                                  pattern: "^conn_[a-z][a-z0-9]{23}$",
                                  "x-bisibility-public-id": "conn",
                                }),
                              }),
                            }),
                          }),
                        }),
                      ]),
                    }),
                  }),
                }),
              ]),
            },
          },
        },
      },
    },
  });
});
