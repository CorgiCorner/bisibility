import { expect, test } from "vitest";
import {
  assertOfflineCoverage,
  classifyOfflineCases,
  conformanceCases,
  realDatabaseOnly,
  serialOnlyTransactions,
  unsupportedHostCases,
} from "./conformance-coverage.test-fixture";

const reviewed = () =>
  [...realDatabaseOnly, ...unsupportedHostCases].map((name) => ({ name, mode: "skip" }));

test.each(["skip", "todo"])(
  "rejects a newly hidden %s case with a runnable positive control",
  (mode) => {
    expect(() => classifyOfflineCases([...reviewed(), { name: "new case", mode }])).toThrow(
      "Unreviewed",
    );
    expect(() =>
      classifyOfflineCases([...reviewed(), { name: "new case", mode: "run" }]),
    ).not.toThrow();
  },
);
test("rejects a disappeared reviewed case", () => {
  expect(() => classifyOfflineCases(reviewed().slice(1))).toThrow("Missing reviewed case");
  expect(() => classifyOfflineCases([...reviewed(), reviewed()[0]])).toThrow(
    "Missing reviewed case",
  );
});
test.each([undefined, "skip", "todo", "run"])(
  "requires execution evidence for state %s",
  (state) => {
    expect(() =>
      assertOfflineCoverage([{ name: "new case", mode: "run", result: { state } }]),
    ).toThrow("did not run");
    expect(() =>
      assertOfflineCoverage([{ name: "new case", mode: "run", result: { state: "pass" } }]),
    ).not.toThrow();
  },
);
test("finds nested cases and marks only the reviewed real database cases", () => {
  const cases = conformanceCases({
    tasks: [
      {
        name: "suite",
        mode: "run",
        tasks: reviewed().map((t) => ({
          ...t,
          mode: unsupportedHostCases.has(t.name) ? "skip" : "run",
        })),
      },
    ],
  });
  classifyOfflineCases(cases);
  expect(cases).toHaveLength(realDatabaseOnly.size + unsupportedHostCases.size);
  expect(cases.every((t) => t.mode === "skip")).toBe(true);
  expect(() => assertOfflineCoverage(cases)).not.toThrow();
});
test("rejects overlapping offline transactions and allows later sequential transactions", async () => {
  const run = serialOnlyTransactions();
  let finish = () => {};
  const first = run(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await expect(run(async () => 2)).rejects.toThrow("Independent transactions");
  finish();
  await first;
  expect(await run(async () => 3)).toBe(3);
});
