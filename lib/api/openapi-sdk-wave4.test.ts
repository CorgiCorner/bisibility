import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";
import { evaluateRequestConformance } from "./openapi-request-conformance.test-support";
import { evaluateResponseConformance } from "./openapi-response-conformance.test-support";
import { operationsById } from "./openapi-response-findings.test-support";
import { sdkWave4ReadyOperationIds } from "./openapi-sdk-wave4";
import { operationInputs } from "./operation-input-registry";
import type { ResponseCaptureFile } from "./response-capture.test-support";

const document = getOpenApiDocument();
const operations = operationsById(document);
const scope = new Set(sdkWave4ReadyOperationIds);

const directory = new URL("./__fixtures__/response-captures/", import.meta.url);
const sourced = readdirSync(directory)
  .filter((file) => file.endsWith(".json"))
  .flatMap((file) => {
    const data = JSON.parse(readFileSync(new URL(file, directory), "utf8")) as ResponseCaptureFile;
    return data.captures.map((capture) => ({ capture, source: data.source }));
  });
const requestFindings = evaluateRequestConformance(document, operationInputs);
let responseFindings: ReturnType<typeof evaluateResponseConformance> | undefined;

describe("SDK wave 4 contract boundaries", () => {
  it("documents every wave 4 operation", () => {
    expect([...scope].filter((id) => !operations.has(id))).toEqual([]);
  });

  it.each([...scope])("%s has no request drift", (id) => {
    expect(requestFindings.filter((entry) => entry.operation === id)).toEqual([]);
  });

  it.each([...scope])("%s has no reachable machine schema names", (id) => {
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
    visit(operations.get(id));
  });
});

it.skipIf(process.env.BISIBILITY_RESPONSE_CAPTURE === "write").each([...scope])(
  "%s has real-router success captures and no response drift",
  { timeout: 20_000 },
  (id) => {
    expect(
      sourced.some(
        ({ capture }) =>
          capture.operationId === id && capture.status >= 200 && capture.status < 300,
      ),
      id,
    ).toBe(true);
    responseFindings ??= evaluateResponseConformance(document, sourced);
    expect(responseFindings.filter((entry) => entry.operation === id)).toEqual([]);
  },
);
