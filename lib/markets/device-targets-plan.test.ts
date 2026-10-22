import { expect, it } from "vitest";
import { initialMarketDevice, marketDeviceSelectionSchema } from "./device-targets-input";
import {
  type DeviceSourceKeyword,
  marketDeviceCandidates,
  marketDevicePlan,
} from "./device-targets-plan";

const input = {
  projectId: "prj_a",
  marketId: "pmkt_a",
  device: "mobile" as const,
  scheduleId: null,
};
const row = (
  text: string,
  device = "desktop",
  archivedAt: Date | null = null,
): DeviceSourceKeyword => ({
  publicId: `${text}:${device}`,
  text,
  device,
  archivedAt,
  targetUrl: "/expected",
  topic: null,
  intent: null,
  tags: [],
});
it("adds only missing device variants of active terms without restoring archived targets", () => {
  const result = marketDevicePlan(
    [
      row("a"),
      row("a", "mobile"),
      row("b"),
      row("b", "mobile", new Date()),
      row("c"),
      row("archived-source", "desktop", new Date()),
    ],
    input,
    null,
  );
  expect(result).toMatchObject({
    keywordCount: 3,
    newCheckCount: 1,
    existingCount: 1,
    archivedCount: 1,
  });
  if (result.outcome !== "ready") throw new Error("Expected reviewed scope");
  expect(result.missing).toEqual([row("c")]);
});
it("deduplicates normalized keyword terms across device/case variants", () => {
  expect(
    marketDevicePlan([row("Word"), row(" word "), row("word", "mobile")], input, null),
  ).toMatchObject({ keywordCount: 1, newCheckCount: 0 });
});
it("changes the confirmation fingerprint when scope, metadata, device or schedule changes", () => {
  const firstPlan = marketDevicePlan([row("a")], input, null);
  if (firstPlan.outcome !== "ready") throw new Error("Expected reviewed scope");
  const first = firstPlan.fingerprint;
  for (const next of [
    marketDevicePlan([row("b")], input, null),
    marketDevicePlan([{ ...row("a"), targetUrl: "/different" }], input, null),
    marketDevicePlan([row("a")], { ...input, device: "desktop" }, null),
    marketDevicePlan([row("a")], input, ["schedule", "v2"]),
  ])
    expect(next.outcome === "ready" && next.fingerprint).not.toBe(first);
});
it("refuses oversized selections instead of silently truncating or changing their scope", () => {
  expect(
    marketDevicePlan(
      Array.from({ length: 501 }, (_, i) => row(String(i))),
      input,
      null,
    ),
  ).toMatchObject({ outcome: "unavailable", reason: "selection_too_large" });
});
it("suggests the other device without selecting a paid schedule", () => {
  expect(initialMarketDevice(["desktop"])).toBe("mobile");
  expect(initialMarketDevice(["mobile"])).toBe("desktop");
  expect(initialMarketDevice(["desktop", "mobile"])).toBe("mobile");
});

it("deduplicates equal metadata deterministically and counts one additional check", () => {
  const result = marketDevicePlan(
    [
      { ...row(" word "), publicId: "z" },
      { ...row("Word"), publicId: "a" },
    ],
    input,
    null,
  );
  expect(result).toMatchObject({ outcome: "ready", keywordCount: 1, newCheckCount: 1 });
  if (result.outcome !== "ready") throw new Error("Expected reviewed scope");
  expect(result.missing[0].publicId).toBe("a");
});
it.each(["targetUrl", "topic", "intent", "tags"] as const)(
  "refuses conflicting %s for a normalized term that needs the device",
  (key) => {
    const variant = {
      ...row("WORD"),
      [key]: key === "tags" ? [{ tag: { name: "other" } }] : "different",
    };
    expect(marketDevicePlan([row("word"), variant], input, null)).toEqual({
      outcome: "unavailable",
      reason: "ambiguous_keywords",
    });
  },
);
it.each([null, new Date()])(
  "does not flag source conflicts for an already-existing or archived device tuple",
  (archivedAt) => {
    const result = marketDevicePlan(
      [row("word"), { ...row("WORD"), targetUrl: "/different" }, row("word", "mobile", archivedAt)],
      input,
      null,
    );
    expect(result).toMatchObject({ outcome: "ready", newCheckCount: 0 });
  },
);

it("narrows one selected canonical source out of four without broadening the scope", () => {
  const sources = [row("a"), row("b"), row("c"), row("d")];
  const result = marketDevicePlan(sources, { ...input, keywordIds: [sources[1].publicId] }, null);
  expect(result).toMatchObject({ outcome: "ready", keywordCount: 1, newCheckCount: 1 });
  if (result.outcome !== "ready") throw new Error("Expected selected scope");
  expect(result.missing).toEqual([sources[1]]);
});
it("keeps an explicit empty selection empty instead of using all keywords", () => {
  expect(marketDevicePlan([row("a"), row("b")], { ...input, keywordIds: [] }, null)).toMatchObject({
    outcome: "ready",
    keywordCount: 0,
    newCheckCount: 0,
    existingCount: 0,
    archivedCount: 0,
    missing: [],
  });
});
it.each(["unknown", "other-market:desktop", "archived:desktop", "noncanonical"])(
  "rejects an unknown, foreign or stale selected source %s",
  (publicId) => {
    const sources = [
      row("a"),
      row("archived", "desktop", new Date()),
      { ...row(" A "), publicId: "noncanonical" },
    ];
    expect(marketDevicePlan(sources, { ...input, keywordIds: [publicId] }, null)).toEqual({
      outcome: "unavailable",
      reason: "selection_changed",
    });
  },
);
it("deduplicates selected IDs and binds confirmation to the explicit selection", () => {
  const sources = [row("a"), row("b")];
  const selected = marketDevicePlan(
    sources,
    { ...input, keywordIds: [sources[0].publicId, sources[0].publicId] },
    null,
  );
  expect(selected).toMatchObject({ outcome: "ready", keywordCount: 1, newCheckCount: 1 });
  const other = marketDevicePlan(sources, { ...input, keywordIds: [sources[1].publicId] }, null);
  expect(selected.outcome === "ready" && selected.fingerprint).not.toBe(
    other.outcome === "ready" && other.fingerprint,
  );
});
it("projects stable canonical active sources with active and archived device variants", () => {
  const sources = [
    { ...row(" Word "), publicId: "z" },
    { ...row("word"), publicId: "a" },
    { ...row("WORD", "mobile", new Date()), publicId: "b" },
    row("archived-only", "desktop", new Date()),
    { ...row("other", "mobile"), publicId: "c" },
  ];
  const before = [...sources];
  expect(marketDeviceCandidates(sources)).toEqual([
    { id: "a", keyword: "word", existingDevices: ["desktop", "mobile"] },
    { id: "c", keyword: "other", existingDevices: ["mobile"] },
  ]);
  expect(marketDeviceCandidates([...sources].reverse())).toEqual(marketDeviceCandidates(sources));
  expect(sources).toEqual(before);
});
it("parses bounded public keyword IDs while preserving absent versus empty selection", () => {
  const valid = {
    ...input,
    projectId: `prj_${"a".repeat(24)}`,
    marketId: `pmkt_${"b".repeat(24)}`,
  };
  expect(marketDeviceSelectionSchema.parse(valid)).not.toHaveProperty("keywordIds");
  expect(marketDeviceSelectionSchema.parse({ ...valid, keywordIds: [] }).keywordIds).toEqual([]);
  expect(
    marketDeviceSelectionSchema.parse({ ...valid, keywordIds: [`kw_${"c".repeat(24)}`] })
      .keywordIds,
  ).toEqual([`kw_${"c".repeat(24)}`]);
  expect(
    marketDeviceSelectionSchema.safeParse({ ...valid, keywordIds: ["internal-id"] }).success,
  ).toBe(false);
  expect(
    marketDeviceSelectionSchema.safeParse({
      ...valid,
      keywordIds: Array(501).fill(`kw_${"c".repeat(24)}`),
    }).success,
  ).toBe(false);
});
