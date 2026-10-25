import { Prisma } from "@/lib/generated/prisma/client";
import { documentedInspection } from "@/lib/providers/analytics/gsc-indexing-fixtures.test-support";
import { normalizeGscInspection } from "@/lib/providers/analytics/gsc-inspection-result";
import { urlPresenceView } from "@/lib/queries/keyword-row-history";
import { pageIndexingGroup, resultFreshness } from "@/lib/search-index/report";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistInspectionFailure, persistPresence } from "./storage";

const mocks = vi.hoisted(() => ({
  tx: {
    $executeRaw: vi.fn(),
    urlPresence: { findUnique: vi.fn(), upsert: vi.fn() },
    urlPresenceChange: { create: vi.fn() },
  },
  transaction: vi.fn(),
  emit: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emit }));
// Fixture is a documented shape, not captured.
const inspection = normalizeGscInspection(documentedInspection);
const input = {
  canonical: true,
  inspection,
  now: new Date("2026-10-24T12:00:00Z"),
  projectId: "project",
  url: "https://example.com/",
  source: "manual" as const,
};
let stored: Record<string, unknown> | null;
beforeEach(() => {
  vi.resetAllMocks();
  stored = null;
  let queue = Promise.resolve();
  mocks.transaction.mockImplementation((fn) => {
    const result = queue.then(() => fn(mocks.tx));
    queue = result.then(() => undefined);
    return result;
  });
  mocks.tx.urlPresence.findUnique.mockImplementation(async () => stored);
  mocks.tx.urlPresence.upsert.mockImplementation(async ({ create, update }) => {
    stored = stored ? { ...stored, ...update } : create;
    return stored;
  });
});

describe("change-only inspection storage", () => {
  it("stores all fields and a first baseline with null previous and no signals", async () => {
    expect(await persistPresence(input)).toBe(false);
    expect(stored).toMatchObject({
      source: "manual",
      indexingState: inspection.indexingState,
      sitemaps: inspection.sitemap,
      richResultsSummary: inspection.richResultsResult,
    });
    expect(mocks.tx.urlPresenceChange.create).toHaveBeenCalledExactlyOnceWith({
      data: expect.objectContaining({
        previous: Prisma.JsonNull,
        next: expect.objectContaining({ verdict: "PASS" }),
      }),
    });
    expect(mocks.emit).not.toHaveBeenCalled();
  });
  it("writes nothing extra on a steady daily result", async () => {
    await persistPresence(input);
    await persistPresence({ ...input, now: new Date("2026-10-25T12:00:00Z") });
    expect(mocks.tx.urlPresenceChange.create).toHaveBeenCalledTimes(1);
    expect(mocks.emit).not.toHaveBeenCalled();
  });
  it("baselines newly recorded fields on a pre-migration row", async () => {
    stored = {
      ...inspection,
      checkedAt: new Date(0),
      googleCanonical: null,
      indexingState: null,
      robotsTxtState: null,
      pageFetchState: null,
    };
    await persistPresence(input);
    expect(mocks.tx.urlPresenceChange.create).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
    await persistPresence({
      ...input,
      inspection: { ...inspection, robotsTxtState: "DISALLOWED" },
    });
    expect(mocks.tx.urlPresenceChange.create).toHaveBeenCalledTimes(1);
  });
  it.each(["PASS", "FAIL"])(
    "keeps legacy %s transitions and signals exactly once",
    async (verdict) => {
      stored = {
        checkedAt: new Date(0),
        verdict,
        coverageState: "Old state",
        googleCanonical: null,
        indexingState: null,
        robotsTxtState: null,
        pageFetchState: null,
      };
      const next = {
        ...input,
        inspection: { ...inspection, verdict: verdict === "PASS" ? "FAIL" : "PASS" },
      };
      await persistPresence(next);
      await persistPresence(next);
      expect(mocks.tx.urlPresenceChange.create).toHaveBeenCalledTimes(1);
      expect(mocks.emit).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ type: verdict === "PASS" ? "url.deindexed" : "url.indexed" }),
        mocks.tx,
      );
    },
  );
  it("keeps legacy coverage-only changes without a verdict signal", async () => {
    stored = {
      checkedAt: new Date(0),
      verdict: inspection.verdict,
      coverageState: "Old state",
      googleCanonical: null,
      indexingState: null,
      robotsTxtState: null,
      pageFetchState: null,
    };
    await persistPresence(input);
    expect(mocks.tx.urlPresenceChange.create).toHaveBeenCalledTimes(1);
    expect(mocks.emit).not.toHaveBeenCalled();
  });
  it("serializes concurrent retries and emits once for each indexed transition", async () => {
    await persistPresence(input);
    mocks.tx.urlPresenceChange.create.mockClear();
    const next = {
      ...input,
      inspection: { ...inspection, verdict: "FAIL", coverageState: "Not found (404)" },
    };
    await Promise.all([persistPresence(next), persistPresence(next)]);
    expect(mocks.tx.urlPresenceChange.create).toHaveBeenCalledTimes(1);
    expect(mocks.emit).toHaveBeenCalledTimes(1);
    expect(mocks.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "url.deindexed" }),
      mocks.tx,
    );
    await persistPresence(input);
    expect(mocks.emit).toHaveBeenCalledTimes(2);
  });
  it("records canonical or robots changes without an indexed-state signal", async () => {
    await persistPresence(input);
    mocks.tx.urlPresenceChange.create.mockClear();
    await persistPresence({
      ...input,
      inspection: {
        ...inspection,
        googleCanonical: "https://example.com/other",
        robotsTxtState: "DISALLOWED",
      },
    });
    expect(mocks.tx.urlPresenceChange.create).toHaveBeenCalledTimes(1);
    expect(mocks.emit).not.toHaveBeenCalled();
  });
});

it("keeps a failed first attempt uninspected and baselines the first success", async () => {
  await persistInspectionFailure(input);
  expect(stored).toMatchObject({
    checkedAt: null,
    inspectionFailedAt: input.now,
    inspectionError: "inspection_failed",
  });
  const row = stored as unknown as Parameters<typeof urlPresenceView>[0] & {
    inspectionError: string;
    checkedAt: null;
    verdict: null;
  };
  expect(urlPresenceView(row)).toBe(null);
  expect(pageIndexingGroup(row)).toBe("inspection_failed");
  expect(resultFreshness([row])).toMatchObject({
    checked: 0,
    oldestResultAt: null,
    newestResultAt: null,
  });
  await persistPresence(input);
  expect(stored).toMatchObject({
    checkedAt: input.now,
    inspectionFailedAt: input.now,
    inspectionError: null,
  });
  expect(mocks.emit).not.toHaveBeenCalled();
  expect(mocks.tx.urlPresenceChange.create).toHaveBeenCalledTimes(1);
});
it("preserves an old Google result on failure and rejects stale failures", async () => {
  await persistPresence(input);
  const failure = { ...input, now: new Date(input.now.getTime() + 86_400_000) };
  await persistInspectionFailure(failure);
  expect(stored).toMatchObject({
    checkedAt: input.now,
    verdict: "PASS",
    inspectionFailedAt: failure.now,
  });
  await persistInspectionFailure({ ...input, now: new Date(0) });
  expect(stored).toMatchObject({ checkedAt: input.now, inspectionFailedAt: failure.now });
  await persistPresence({ ...failure, inspection: { ...inspection, verdict: "FAIL" } });
  expect(mocks.emit).toHaveBeenCalledTimes(1);
});

it("compares a successful null-verdict result after failure instead of rebaselining it", async () => {
  await persistPresence({ ...input, inspection: { ...inspection, verdict: null } });
  mocks.tx.urlPresenceChange.create.mockClear();
  await persistInspectionFailure({ ...input, now: new Date(input.now.getTime() + 1000) });
  await persistPresence({ ...input, now: new Date(input.now.getTime() + 2000) });
  expect(mocks.emit).toHaveBeenCalledTimes(1);
  expect(mocks.tx.urlPresenceChange.create).toHaveBeenCalledTimes(1);
});

it("writes one baseline and no signal for concurrent first-inspection retries", async () => {
  await Promise.all([persistPresence(input), persistPresence(input)]);
  expect(mocks.tx.urlPresenceChange.create).toHaveBeenCalledTimes(1);
  expect(mocks.emit).not.toHaveBeenCalled();
});
