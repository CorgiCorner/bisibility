import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";
import {
  evaluateRequestConformance,
  type RequestConformanceEntry,
  requestEntryKey,
} from "./openapi-request-conformance.test-support";
import { operationsById } from "./openapi-response-findings.test-support";
import { operationInputs } from "./operation-input-registry";

/**
 * Report-only ratchet: the request shape each operation declares in the OpenAPI document is
 * compared with the input validation its handler registers in `operation-input-registry.ts`,
 * and the resulting failure list must equal the committed one. A new failure and a failure that
 * disappears both fail until the list is regenerated:
 *
 *   npm run openapi:request-conformance:write
 *
 * Review the diff of `__fixtures__/openapi-request-conformance.json`: a removed entry is drift
 * fixed, an added one is drift introduced. A new operation without a registry entry appears as
 * `no-validator`.
 */

const listFile = fileURLToPath(
  new URL("./__fixtures__/openapi-request-conformance.json", import.meta.url),
);
const writeMode = process.env.BISIBILITY_REQUEST_CONFORMANCE === "write";

function ratchetDifferences(
  committed: RequestConformanceEntry[],
  current: RequestConformanceEntry[],
) {
  const before = new Map(committed.map((entry) => [requestEntryKey(entry), entry]));
  const after = new Map(current.map((entry) => [requestEntryKey(entry), entry]));
  const added = [...after.keys()].filter((key) => !before.has(key));
  const removed = [...before.keys()].filter((key) => !after.has(key));
  const changed = [...after.keys()].filter(
    (key) => before.has(key) && !isDeepStrictEqual(before.get(key), after.get(key)),
  );
  return { added, changed, removed };
}

describe("OpenAPI request conformance", () => {
  it("registers input only for operations the spec declares", () => {
    const documented = operationsById(getOpenApiDocument());
    const unknown = Object.keys(operationInputs).filter((id) => !documented.has(id));
    expect(unknown).toEqual([]);
  });

  it("matches the committed failure list", () => {
    const current = evaluateRequestConformance(getOpenApiDocument(), operationInputs);
    if (writeMode) {
      writeFileSync(listFile, `${JSON.stringify(current, null, 2)}\n`);
      return;
    }
    const committed: RequestConformanceEntry[] = JSON.parse(readFileSync(listFile, "utf8"));
    expect(
      ratchetDifferences(committed, current),
      "The request conformance list changed. Run `npm run openapi:request-conformance:write` " +
        "and review the diff of lib/api/__fixtures__/openapi-request-conformance.json.",
    ).toEqual({ added: [], changed: [], removed: [] });
  });
});
