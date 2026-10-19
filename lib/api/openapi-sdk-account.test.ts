import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";
import { evaluateRequestConformance } from "./openapi-request-conformance.test-support";
import { evaluateResponseConformance } from "./openapi-response-conformance.test-support";
import { operationsById } from "./openapi-response-findings.test-support";
import { blockingSubjects, evaluateSdkExtensions } from "./openapi-sdk-lint.test-support";
import { sdkFirstWaveOperationIds } from "./openapi-sdk-operations";
import { operationInputs } from "./operation-input-registry";
import type { ResponseCaptureFile } from "./response-capture.test-support";

const ids = [
  "getAnalyticsConsent",
  "updateAnalyticsConsent",
  "registerDevicePushToken",
  "listDevicePushTokens",
  "deleteDevicePushToken",
  "deleteMe",
] as const;
const document = getOpenApiDocument();
const captureDirectory = path.join(process.cwd(), "lib/api/__fixtures__/response-captures");
const sourced = readdirSync(captureDirectory)
  .filter((file) => file.endsWith(".json"))
  .flatMap((file) => {
    const saved = JSON.parse(
      readFileSync(path.join(captureDirectory, file), "utf8"),
    ) as ResponseCaptureFile;
    return saved.captures
      .filter((capture) => ids.some((id) => id === capture.operationId))
      .map((capture) => ({ capture, source: saved.source }));
  });

function reachableMachineNames(value: unknown, seen = new Set<string>()): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => reachableMachineNames(item, seen));
  if (!value || typeof value !== "object") return [];
  const node = value as Record<string, unknown>;
  const ref = node.$ref;
  const found: string[] = [];
  if (typeof ref === "string" && ref.startsWith("#/components/schemas/") && !seen.has(ref)) {
    seen.add(ref);
    const name = ref.slice("#/components/schemas/".length);
    if (name.includes("___schema")) found.push(name);
    found.push(
      ...reachableMachineNames(
        document.components.schemas[name as keyof typeof document.components.schemas],
        seen,
      ),
    );
  }
  return [...found, ...Object.values(node).flatMap((item) => reachableMachineNames(item, seen))];
}

describe("account SDK operation gate", () => {
  const responses = evaluateResponseConformance(document, sourced);
  const requests = evaluateRequestConformance(document, operationInputs);
  const extensions = evaluateSdkExtensions(document);
  const operations = operationsById(document);
  it.each(ids)("%s has real success evidence and no conformance or extension gaps", (id) => {
    expect(sdkFirstWaveOperationIds).toContain(id);
    expect(
      sourced.some(
        ({ capture }) =>
          capture.operationId === id && capture.status >= 200 && capture.status < 300,
      ),
    ).toBe(true);
    expect(responses.filter((entry) => entry.operation === id)).toEqual([]);
    expect(requests.filter((entry) => entry.operation === id)).toEqual([]);
    const blocking = blockingSubjects(extensions, id);
    expect(extensions.filter((entry) => blocking.includes(entry.subject))).toEqual([]);
    expect(reachableMachineNames(operations.get(id))).toEqual([]);
  });

  it("declares the recent sign-in refusal without changing credential scope", () => {
    const operation = document.paths["/me"].delete;
    expect(operation.security).toContainEqual({ PersonalAccessToken: [] });
    expect(operation.security).toContainEqual({ AppOAuth: ["api:write"] });
    expect(operation).toHaveProperty("x-bisibility-idempotency", "optional");
    expect(operation.responses["403"].content["application/problem+json"].schema).toEqual({
      $ref: "#/components/schemas/MeDeletionForbidden",
    });
    const refusals = sourced.filter(
      ({ capture }) => capture.operationId === "deleteMe" && capture.status === 403,
    );
    expect(
      refusals.some(
        ({ capture }) =>
          (capture.body as { details?: { code?: string } }).details?.code ===
          "reauthentication_required",
      ),
    ).toBe(true);
  });
});
