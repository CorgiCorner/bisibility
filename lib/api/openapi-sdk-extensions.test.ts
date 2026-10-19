import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";
import {
  blockingSubjects,
  evaluateSdkExtensions,
  type SdkGapEntry,
} from "./openapi-sdk-lint.test-support";
import type { SdkDocument } from "./openapi-sdk-lint-schema.test-support";
import { extensionValueProblems } from "./openapi-sdk-lint-values.test-support";
import { openApiSdkOperations, sdkFirstWaveOperationIds } from "./openapi-sdk-operations";
import { operationSpend } from "./operation-provider-spend";

/**
 * `x-bisibility-*` lint for the SDK generator. An operation may be generated once its response
 * and request conformance pass and it has no entry here. Every `x-bisibility-*` value is checked
 * everywhere; missing extensions and unnamed inline types are a ratchet, like the conformance
 * suites: the first wave must have no gaps, every other operation lists its gaps in
 * `__fixtures__/openapi-sdk-extensions.json`, and the list must equal the committed one.
 *
 *   npm run openapi:sdk-extensions:write
 *
 * Review the diff: a removed entry is a gap closed, an added one is a gap introduced.
 */

const listFile = fileURLToPath(
  new URL("./__fixtures__/openapi-sdk-extensions.json", import.meta.url),
);
const writeMode = process.env.BISIBILITY_SDK_EXTENSIONS === "write";
const document = getOpenApiDocument() as unknown as SdkDocument;

function ratchetDifferences(committed: SdkGapEntry[], current: SdkGapEntry[]) {
  const before = new Map(committed.map((entry) => [entry.subject, entry]));
  const after = new Map(current.map((entry) => [entry.subject, entry]));
  const added = [...after.keys()].filter((key) => !before.has(key));
  const removed = [...before.keys()].filter((key) => !after.has(key));
  const changed = [...after.keys()].filter(
    (key) => before.has(key) && !isDeepStrictEqual(before.get(key), after.get(key)),
  );
  return { added, changed, removed };
}

describe("OpenAPI x-bisibility extensions", () => {
  const current = evaluateSdkExtensions(document);

  it("uses only the known vocabulary, with well-formed and consistent values", () => {
    expect(extensionValueProblems(document)).toEqual([]);
  });

  it("marks paid exactly the operations in the provider spend registry, in both directions", () => {
    const disagreements = Object.values(document.paths).flatMap((item) =>
      Object.values(item).flatMap((value) => {
        const operation = value as { operationId?: string; "x-bisibility-cost"?: object };
        if (!operation.operationId) return [];
        const cost = operation["x-bisibility-cost"] as
          | { kind?: string; timing?: string }
          | undefined;
        const spend = operationSpend(operation.operationId);
        if (cost?.kind === "paid" && !spend)
          return [`paid but not in the registry: ${operation.operationId}`];
        if (spend && cost?.kind !== "paid")
          return [`in the registry but not paid: ${operation.operationId}`];
        if (spend && cost?.timing !== spend.timing)
          return [`timing differs: ${operation.operationId}`];
        if (!cost) return [`no x-bisibility-cost: ${operation.operationId}`];
        return [];
      }),
    );
    expect(disagreements).toEqual([]);
  });

  it("annotates only documented operations", () => {
    const documented = new Set(
      Object.values(document.paths).flatMap((item) =>
        Object.values(item).map((operation) => (operation as { operationId?: string }).operationId),
      ),
    );
    expect(Object.keys(openApiSdkOperations).filter((id) => !documented.has(id))).toEqual([]);
  });

  it.each(sdkFirstWaveOperationIds)("%s has no extension gaps", (operationId) => {
    const blocking = blockingSubjects(current, operationId);
    expect(current.filter((entry) => blocking.includes(entry.subject))).toEqual([]);
  });

  it("matches the committed gap list", () => {
    if (writeMode) {
      writeFileSync(listFile, `${JSON.stringify(current, null, 2)}\n`);
      return;
    }
    const committed: SdkGapEntry[] = JSON.parse(readFileSync(listFile, "utf8"));
    expect(
      ratchetDifferences(committed, current),
      "The x-bisibility extension gap list changed. Run `npm run openapi:sdk-extensions:write` " +
        "and review the diff of lib/api/__fixtures__/openapi-sdk-extensions.json.",
    ).toEqual({ added: [], changed: [], removed: [] });
  });
});
