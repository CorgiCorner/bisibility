import { expect, it } from "vitest";
import { evaluateOrganicReplay } from "./evaluate";
import { rawTextHash } from "./hash";
import { source } from "./test-fixture";

it("replays original roots, preserving unknown time/quality and ignoring later continuation", () => {
  const row = source({
    organic_results: [{ domain: "example.test", rank: 9 }],
    snapshotExtension: { pages: [{ organic_results: [{ domain: "later.test", rank: 1 }] }] },
    tasks: [{ result: [{ items: [{ domain: "other.test", rank: 2 }] }] }],
  });
  expect(evaluateOrganicReplay(row, "project")).toMatchObject({
    status: "applied",
    facts: [{ domain: "example.test", position: 9 }],
    retainedObservedAt: null,
    qualification: "retained_facts_only",
  });
  expect(row.checkedAtText).toBe("2026-10-10 12:03:04.123");
});
it("retains empty original facts without an absence certificate", () => {
  expect(evaluateOrganicReplay(source({ organic_results: [] }), "project")).toMatchObject({
    status: "applied",
    facts: [],
    retainedObservedAt: null,
    qualification: "retained_facts_only",
  });
});
it.each([
  [{ source: "import" }, "unrecognized_container"],
  [{ tasks: [{ result: [] }, { result: [] }] }, "unrecognized_container"],
])("refuses unrecognized/ambiguous original collections", (raw, status) =>
  expect(evaluateOrganicReplay(source(raw), "project").status).toBe(status),
);
it.each([
  [{ status: "running" }, "not_completed"],
  [{ provider: "unsupported" }, "unsupported_provider"],
  [{ rawBytes: 1048577 }, "source_too_large"],
  [{ checkPublicId: "check_unsafe" }, "invalid_source_id"],
  [{ storedText: "[]", storedHash: rawTextHash("[]") }, "projection_present"],
  [{ rawText: null, rawHash: rawTextHash(null) }, "raw_expired"],
])("names exclusions without a guessed zero", (patch, status) =>
  expect(evaluateOrganicReplay(source({}, patch), "project").status).toBe(status),
);
it("rejects changed source bytes", () =>
  expect(() => evaluateOrganicReplay(source({}, { rawHash: "a".repeat(64) }), "project")).toThrow(
    "invalid_source_hash",
  ));
it("compacts only real positive ranked domains using the canonical parser", () =>
  expect(
    evaluateOrganicReplay(
      source({
        organic_results: [
          { domain: "www.example.test", rank: 6 },
          { domain: "example.test", rank: 9 },
          { domain: "none.test", rank: 101 },
          { domain: "zero.test", rank: 0 },
        ],
      }),
      "project",
    ).facts,
  ).toEqual([{ domain: "example.test", position: 6 }]));
