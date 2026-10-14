import { beforeEach, describe, expect, it, vi } from "vitest";
import { getKeywordCompetitors } from "./competitor-policies";
import {
  legacyAsOf,
  legacyDbCheck,
  legacyKeyword,
  legacyProject,
  legacyReportOptions,
  legacyScope,
} from "./legacy-dashboard.test-fixture";
import { getOverviewCompetitors } from "./overview-competitors";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  competitor: vi.fn(),
  keywords: vi.fn(),
  keyword: vi.fn(),
  checks: vi.fn(),
  checkCount: vi.fn(),
  itemCount: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.auth }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    observationItem: { count: mocks.itemCount },
    competitor: { findMany: mocks.competitor },
    keyword: { findMany: mocks.keywords, findFirst: mocks.keyword },
    rankCheck: { findMany: mocks.checks, count: mocks.checkCount },
  },
}));
const filters = {
  device: "mobile" as const,
  marketIds: ["us"],
  range: "7d" as const,
  tag: "Product",
};
const now = legacyAsOf;
const selected = { ...legacyKeyword(), device: "mobile" as const };
const options = legacyReportOptions(now, legacyProject.id, {
  scopes: new Map([
    [selected.publicId, legacyScope(selected.publicId, legacyProject.id, "mobile")],
  ]),
});
const competitor = {
  publicId: "cmp_1",
  domain: "rival.test",
  label: "Rival",
  scopePolicy: "all_markets",
  marketOverrides: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ project: legacyProject, actor: { id: "owned-fixture-user" } });
  mocks.transaction.mockImplementation((callback) =>
    callback({
      competitor: { findMany: mocks.competitor },
      keyword: { findMany: mocks.keywords },
      rankCheck: { findMany: mocks.checks, count: mocks.checkCount },
      observationItem: { count: mocks.itemCount },
    }),
  );
  mocks.competitor.mockResolvedValue([competitor]);
  mocks.keywords.mockResolvedValue([selected]);
  mocks.keyword.mockResolvedValue({ locationId: "us" });
  mocks.checkCount.mockResolvedValue(1);
  mocks.itemCount.mockResolvedValue(1);
  mocks.checks.mockResolvedValue([legacyDbCheck(selected, 5)]);
});

describe("competitor context queries", () => {
  it("authorizes and applies every dashboard filter before choosing the qualified retained check", async () => {
    const data = await getOverviewCompetitors("prj_public", filters, now, options);
    expect(mocks.auth).toHaveBeenCalledWith("prj_public");
    expect(mocks.competitor.mock.calls[0][0].where).toEqual({ projectId: "internal-project" });
    expect(mocks.keywords.mock.calls[0][0]).toMatchObject({
      take: 10001,
      where: {
        projectId: "internal-project",
        device: "mobile",
        locationId: { in: ["us"] },
        tags: { some: { tag: { name: "Product" } } },
        locationRef: {
          projectMarkets: { some: { projectId: "internal-project", status: "active" } },
        },
        createdAt: { lte: now },
      },
    });
    expect(data?.rows[0]).toMatchObject({ above: 1, paired: 1, found: 1 });
    expect(mocks.checks.mock.calls[0][0].select).not.toHaveProperty("raw");
  });

  it("does not query SERPs when there are no configured competitors", async () => {
    mocks.competitor.mockResolvedValue([]);
    expect(await getOverviewCompetitors("prj_public", filters, now, options)).toBeNull();
    expect(mocks.keywords).not.toHaveBeenCalled();
  });

  it("does not promote legacy stored ranks or raw payloads without retained observation proof", async () => {
    mocks.checks.mockResolvedValue([legacyDbCheck(selected, 5, 0, { observationRun: null })]);
    const data = await getOverviewCompetitors("prj_public", filters, now, options);
    expect(data?.rows[0]).toMatchObject({ checked: 0, above: 0, paired: 0 });
    expect(mocks.checks.mock.calls[0][0].where.keyword).toEqual({ projectId: legacyProject.id });
    expect(mocks.checks.mock.calls[0][0].select).not.toHaveProperty("raw");
  });
  it("does not compare a captured country fallback as if it were the requested city", async () => {
    const check = legacyDbCheck(selected, 5);
    mocks.checks.mockResolvedValue([
      {
        ...check,
        observationRun: {
          ...check.observationRun,
          effectiveScope: {
            ...legacyScope(selected.publicId, legacyProject.id, "mobile"),
            location: "Country fallback",
          },
        },
      },
    ]);
    expect(
      (await getOverviewCompetitors("prj_public", filters, now, options))?.rows[0],
    ).toMatchObject({ checked: 0, above: 0, paired: 0 });
  });

  it("uses normalized original organic-group ranks and retains known absence separately from unknown", async () => {
    const check = legacyDbCheck(selected, 5);
    if (!check.observationRun) throw new Error("Expected captured fixture");
    mocks.checks.mockResolvedValue([
      {
        ...check,
        organicRanks: [{ domain: "rival.test", position: 99 }],
        observationRun: {
          ...check.observationRun,
          items: check.observationRun.items.map((item) => ({ ...item, rankAbsolute: 88 })),
        },
      },
    ]);
    expect(
      (await getOverviewCompetitors("prj_public", filters, now, options))?.rows[0],
    ).toMatchObject({ above: 1, paired: 1, averagePosition: 2 });
    mocks.checks.mockResolvedValue([
      { ...check, observationRun: { ...check.observationRun, items: [] } },
    ]);
    expect(
      (await getOverviewCompetitors("prj_public", filters, now, options))?.rows[0],
    ).toMatchObject({ checked: 1, found: 0, above: 0 });
  });
  it("keeps prior fresh measurement after failed execution but excludes stale current proof", async () => {
    mocks.checkCount.mockResolvedValue(2);
    const current = legacyDbCheck(selected, 5);
    mocks.checks.mockResolvedValue([
      current,
      legacyDbCheck(selected, null, 1, {
        status: "failed",
        observationRun: null,
        createdAt: new Date("2026-10-12T11:00:00Z"),
        updatedAt: new Date("2026-10-12T11:00:00Z"),
      }),
    ]);
    expect(
      (await getOverviewCompetitors("prj_public", filters, now, options))?.rows[0],
    ).toMatchObject({ above: 1, paired: 1 });
    mocks.checkCount.mockResolvedValue(1);
    mocks.checks.mockResolvedValue([current]);
    expect(
      (
        await getOverviewCompetitors(
          "prj_public",
          filters,
          now,
          legacyReportOptions(now, legacyProject.id, { freshForMs: 1 }),
        )
      )?.rows[0],
    ).toMatchObject({ checked: 0, above: 0, paired: 0 });
  });

  it("filters keyword competitors by the keyword's actual market without exposing policy internals", async () => {
    mocks.competitor.mockResolvedValue([
      competitor,
      { ...competitor, domain: "excluded.test", scopePolicy: "selected_markets" },
    ]);
    expect(await getKeywordCompetitors("prj_public", "kw_public")).toEqual([
      { publicId: "cmp_1", domain: "rival.test", label: "Rival" },
    ]);
    expect(mocks.keyword).toHaveBeenCalledWith({
      where: { projectId: "internal-project", publicId: "kw_public" },
      select: { locationId: true },
    });
  });

  it("never loads competitors or SERPs after authorization fails", async () => {
    mocks.auth.mockRejectedValue(new Error("Denied"));
    await expect(getOverviewCompetitors("other-project", filters, now)).rejects.toThrow("Denied");
    expect(mocks.competitor).not.toHaveBeenCalled();
    expect(mocks.keywords).not.toHaveBeenCalled();
  });
});
