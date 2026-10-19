import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { getOpenApiDocument } from "./openapi";
import {
  type ConformanceEntry,
  evaluateResponseConformance,
} from "./openapi-response-conformance.test-support";
import {
  isResponseCaptureWriteMode,
  type ResponseCaptureFile,
  responseCaptureDirectory,
} from "./response-capture.test-support";

/**
 * Report-only ratchet: every captured response is validated against the OpenAPI response schema
 * for its status, and the resulting failure list must equal the committed one. A new failure and
 * a failure that disappears both fail until the list is regenerated:
 *
 *   npm run openapi:conformance:write
 *
 * That command re-records the router captures of the opted-in API tests, then rewrites
 * `__fixtures__/openapi-response-conformance.json` with
 * `BISIBILITY_RESPONSE_CONFORMANCE=write`. Review the diff: a removed entry is drift fixed,
 * an added one is drift introduced.
 */

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const listFile = fileURLToPath(
  new URL("./__fixtures__/openapi-response-conformance.json", import.meta.url),
);
const writeMode = process.env.BISIBILITY_RESPONSE_CONFORMANCE === "write";
// The capture pass of `openapi:conformance:write` rewrites the captures this suite reads.
const capturing = isResponseCaptureWriteMode();

function captureFiles(): ResponseCaptureFile[] {
  return readdirSync(responseCaptureDirectory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(responseCaptureDirectory, name), "utf8")));
}

const keyOf = (entry: ConformanceEntry) => `${entry.operation} ${entry.status}`;

function ratchetDifferences(committed: ConformanceEntry[], current: ConformanceEntry[]) {
  const before = new Map(committed.map((entry) => [keyOf(entry), entry]));
  const after = new Map(current.map((entry) => [keyOf(entry), entry]));
  const added = [...after.keys()].filter((key) => !before.has(key));
  const removed = [...before.keys()].filter((key) => !after.has(key));
  const changed = [...after.keys()].filter(
    (key) => before.has(key) && !isDeepStrictEqual(before.get(key), after.get(key)),
  );
  return { added, changed, removed };
}

describe.skipIf(capturing)("OpenAPI response conformance", () => {
  it("records captures only from tests that still opt in to router capture", () => {
    const stale = captureFiles()
      .map((file) => file.source)
      .filter((source) => {
        const path = join(repositoryRoot, source);
        return (
          !existsSync(path) || !readFileSync(path, "utf8").includes("response-capture.test-support")
        );
      });
    expect(stale).toEqual([]);
  });

  // Compiles a validator per captured response against the whole document; it already took
  // about 4 of its default 5 seconds in a full parallel run on a busy machine, so it gets an
  // explicit budget.
  it("matches the committed failure list", { timeout: 20_000 }, () => {
    const sourced = captureFiles().flatMap((file) =>
      file.captures.map((capture) => ({ capture, source: file.source })),
    );
    const current = evaluateResponseConformance(getOpenApiDocument(), sourced);
    if (writeMode) {
      writeFileSync(listFile, `${JSON.stringify(current, null, 2)}\n`);
      return;
    }
    const committed: ConformanceEntry[] = JSON.parse(readFileSync(listFile, "utf8"));
    expect(
      ratchetDifferences(committed, current),
      "The response conformance list changed. Run `npm run openapi:conformance:write` and " +
        "review the diff of lib/api/__fixtures__/openapi-response-conformance.json.",
    ).toEqual({ added: [], changed: [], removed: [] });
  });
});
