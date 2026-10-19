import { readdirSync, readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";
import { evaluateRequestConformance } from "./openapi-request-conformance.test-support";
import { evaluateResponseConformance } from "./openapi-response-conformance.test-support";
import { operationsById } from "./openapi-response-findings.test-support";
import { sdkWave3ReadyOperationIds } from "./openapi-sdk-wave3";
import { operationInputs } from "./operation-input-registry";
import type { ResponseCaptureFile } from "./response-capture.test-support";

const document = getOpenApiDocument();
const operations = operationsById(document);
const scope = new Set(sdkWave3ReadyOperationIds);
const ajv = new Ajv2020({ strict: false, validateFormats: false });
const patch = ajv.compile(document.components.schemas.AlertRulePatch);

describe("SDK wave 3 contract boundaries", () => {
  it("keeps nullable PATCH fields distinct from omission and rejects null arrays", () => {
    const body = { name: "Rule", condition_type: "downtrend" };
    expect(patch(body)).toBe(true);
    expect(
      patch({ ...body, change_pct: null, threshold_position: null, competitor_domain: null }),
    ).toBe(true);
    expect(patch({ ...body, market_ids: [], recipient_ids: [] })).toBe(true);
    expect(patch({ ...body, market_ids: null })).toBe(false);
    expect(patch({ ...body, recipient_ids: null })).toBe(false);
    expect(patch({ name: "Rule" })).toBe(false);
    expect(document.components.schemas.AlertRulePatch.required).not.toContain("change_pct");
  });

  it("requires explicit launch consent, matching revision fields and the idempotency header", () => {
    const operation = operations.get("createAiTrackingRun") as unknown as {
      requestBody: { content: { "application/json": { schema: object } } };
      parameters: object[];
    };
    if (!operation?.requestBody) throw new Error("Launch operation missing");
    const schema = operation.requestBody.content["application/json"].schema;
    const validate = ajv.compile(schema);
    const body = {
      prompt_ids: ["aip_a00000000000000000000000"],
      configurations: [
        {
          provider: "dataforseo",
          engine: "chat_gpt",
          source: "model_api",
          endpoint: "example",
          model: null,
          parameters: { nested: [1, true, null, { value: "example" }] },
        },
      ],
      credential_connection_id: "conn_a00000000000000000000000",
      credential_version: "v1",
      budget_revision: "b1",
      consent_revision: "c1",
      consent: true,
      deadline: "2026-10-18T12:00:00Z",
    };
    expect(validate(body)).toBe(true);
    for (const key of ["consent", "credential_version", "budget_revision", "consent_revision"]) {
      const omitted: Record<string, unknown> = { ...body };
      delete omitted[key];
      expect(validate(omitted), key).toBe(false);
    }
    expect(validate({ ...body, consent: false })).toBe(false);
    expect(operation.parameters).toContainEqual(
      expect.objectContaining({ in: "header", name: "Idempotency-Key", required: true }),
    );
  });

  it("has a validator without request drift for every new operation", () => {
    expect(
      evaluateRequestConformance(document, operationInputs).filter((entry) =>
        scope.has(entry.operation),
      ),
    ).toEqual([]);
  });

  it("has no machine schema names reachable from the new operations", () => {
    const visited = new Set<string>();
    function visit(value: unknown) {
      if (!value || typeof value !== "object") return;
      if ("$ref" in value && typeof value.$ref === "string") {
        expect(value.$ref).not.toContain("___schema");
        if (!visited.has(value.$ref)) {
          visited.add(value.$ref);
          const key = value.$ref.split("/").at(-1) ?? "";
          visit((document.components.schemas as Record<string, object>)[key]);
        }
      }
      for (const child of Object.values(value)) visit(child);
    }
    for (const id of scope) visit(operations.get(id));
  });
});

it.skipIf(process.env.BISIBILITY_RESPONSE_CAPTURE === "write")(
  "has real-router success captures and no response drift for every new operation",
  { timeout: 20_000 },
  () => {
    const directory = new URL("./__fixtures__/response-captures/", import.meta.url);
    const sourced = readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .flatMap((file) => {
        const data = JSON.parse(
          readFileSync(new URL(file, directory), "utf8"),
        ) as ResponseCaptureFile;
        return data.captures.map((capture) => ({ capture, source: data.source }));
      });
    for (const id of scope)
      expect(
        sourced.some(
          ({ capture }) =>
            capture.operationId === id && capture.status >= 200 && capture.status < 300,
        ),
        id,
      ).toBe(true);
    expect(
      evaluateResponseConformance(document, sourced).filter((entry) => scope.has(entry.operation)),
    ).toEqual([]);
  },
);
