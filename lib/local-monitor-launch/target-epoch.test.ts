import { prisma } from "@/lib/db/prisma";
import type { PointRevision } from "@/lib/local-monitoring/types";
import { localKeywordRevision } from "@/lib/local-monitoring-store/canonical";
import type { LocalPolicyPort } from "@/lib/local-monitoring-store/context";
import { createLocalMeasurementTarget } from "@/lib/local-monitoring-store/create-target";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => {
  const keyword = vi.fn(),
    find = vi.fn(),
    create = vi.fn();
  const tx = {
    $queryRaw: vi.fn(),
    keyword: { findFirst: keyword },
    localMeasurementTarget: { findFirst: find, create },
  };
  return { keyword, find, create, tx, scope: vi.fn(), audit: vi.fn() };
});
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: async (body: (tx: unknown) => Promise<unknown>) => body(f.tx) },
}));
vi.mock("@/lib/local-monitoring-store/access", () => ({ localProjectScope: f.scope }));
vi.mock("@/lib/local-monitoring-store/audit", () => ({ auditLocal: f.audit }));
vi.mock("@/lib/local-monitoring-store/point-repository", () => ({
  persistLocalPointRevision: async (
    _tx: unknown,
    _project: string,
    _actor: string,
    point: PointRevision,
  ) => ({ id: point.revisionId }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  f.scope.mockResolvedValue({ actor: { id: "actor" }, project: { id: "project" } });
  f.keyword.mockResolvedValue({
    id: "keyword",
    text: "Dentist",
    locationId: "location",
    device: "desktop",
    measurementTargetEpoch: 9007199254740993n,
    measurementPolicyEpoch: 9007199254740994n,
    updatedAt: new Date("2026-10-12T00:00:00.000Z"),
  });
  f.find.mockResolvedValue(null);
  f.create.mockResolvedValue({ publicId: "lmt_aaaaaaaaaaaaaaaaaaaaaaaa" });
});
describe("persisted keyword epoch for manual target capture", () => {
  it("passes the exact BigInt epoch to policy and serializes a lossless JSON snapshot", async () => {
    const capture = vi.fn<LocalPolicyPort["capture"]>(async (_tx, { keyword }) => ({
      keywordRevision: localKeywordRevision(keyword),
      policyRevision: "monitor-revision",
    }));
    const assertCurrent = vi.fn();
    await createLocalMeasurementTarget(
      {
        projectId: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
        keywordId: "kw_aaaaaaaaaaaaaaaaaaaaaaaa",
        latitude: "52",
        longitude: "21",
        engine: "google",
        surface: "maps",
        resultKind: "map_listing",
        rankScale: "maps_organic",
        language: "en",
        device: "desktop",
        operatingSystem: null,
        cutoff: 20,
        zoom: 12,
      },
      { actor: { id: "actor" } },
      { capture, assertCurrent },
      prisma,
    );
    expect(capture).toHaveBeenCalledWith(
      f.tx,
      expect.objectContaining({
        keyword: expect.objectContaining({
          measurementTargetEpoch: 9007199254740993n,
          measurementPolicyEpoch: 9007199254740994n,
        }),
      }),
    );
    const write = f.create.mock.calls[0][0].data;
    expect(write.keywordSnapshot.measurementTargetEpoch).toBe("9007199254740993");
    expect(write.keywordSnapshot.measurementPolicyEpoch).toBe("9007199254740994");
    expect(write.keywordSnapshot).not.toHaveProperty("measurementEpoch");
    expect(write.target.keywordRevision).toBe("9007199254740993:9007199254740994");
    expect(() => JSON.stringify(write)).not.toThrow();
  });
});
