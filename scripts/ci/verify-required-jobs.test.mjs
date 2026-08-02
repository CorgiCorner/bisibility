import assert from "node:assert/strict";
import test from "node:test";
import { verifyRequiredJobs } from "./verify-required-jobs.mjs";

function verify(results, options = {}) {
  return verifyRequiredJobs({
    allowAllSkipped: options.allowAllSkipped ?? false,
    needsJson: JSON.stringify(
      Object.fromEntries(Object.entries(results).map(([name, result]) => [name, { result }])),
    ),
    optionalJobs: options.optionalJobs ?? "",
  });
}

test("accepts successful required jobs and an explicitly skipped optional job", () => {
  assert.doesNotThrow(() =>
    verify({ coverage: "skipped", static: "success", test: "success" }, { optionalJobs: "coverage" }),
  );
});

test("rejects failed, cancelled, and skipped required jobs", () => {
  for (const result of ["failure", "cancelled", "skipped"]) {
    assert.throws(() => verify({ static: result }), /Required job static must succeed/);
  }
});

test("rejects an optional job name that is absent from needs", () => {
  assert.throws(() => verify({ static: "success" }, { optionalJobs: "coverage" }), /not in needs/);
});

test("accepts a draft only when every dependency is skipped", () => {
  assert.doesNotThrow(() =>
    verify({ static: "skipped", test: "skipped" }, { allowAllSkipped: true }),
  );
  assert.throws(
    () => verify({ static: "success", test: "skipped" }, { allowAllSkipped: true }),
    /must be skipped/,
  );
});
