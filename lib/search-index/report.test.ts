import { getPageIndexingReport } from "@/lib/search-index/report";
import {
  matchesReportWhere,
  reportFixture,
  reportGoldenFixtures,
  reportNow,
  reportRow,
} from "@/tests/page-indexing-report-fixtures";
import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  defaults: vi.fn(),
  targets: vi.fn(),
  rows: vi.fn(),
  settings: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    projectDefaults: { findUnique: db.defaults },
    keyword: { findMany: db.targets },
    urlPresence: { findMany: db.rows },
  },
}));
vi.mock("@/lib/search-index/settings", () => ({ getPageIndexingSettings: db.settings }));

let fixture: ReturnType<typeof reportFixture>;
beforeEach(() => {
  vi.resetAllMocks();
  fixture = reportFixture();
  db.defaults.mockImplementation(async () => fixture.defaults);
  db.targets.mockImplementation(async () => fixture.targets);
  db.settings.mockImplementation(async () => fixture.settings);
  db.rows.mockImplementation(async ({ where, select }) => {
    const rows = fixture.rows.filter((row) => matchesReportWhere(row, where));
    return select
      ? rows.map((row) =>
          Object.fromEntries(Object.keys(select).map((key) => [key, row[key as keyof typeof row]])),
        )
      : rows;
  });
});

it("preserves golden groups, scope, discovery, reasons, budgets and freshness", async () => {
  const reports: Record<string, Awaited<ReturnType<typeof getPageIndexingReport>>> = {};
  for (const [name, data] of Object.entries(reportGoldenFixtures())) {
    fixture = data;
    reports[name] = await getPageIndexingReport("project", reportNow);
  }
  await expect(`${JSON.stringify(reports, null, 2)}\n`).toMatchFileSnapshot(
    "../../tests/__snapshots__/page-indexing-report.json",
  );
});

it.each([
  { mode: "fixed", limit: 2, targetOnly: false, expected: 3 },
  { mode: "fixed", limit: 1, targetOnly: false, expected: null },
  { mode: "fixed", limit: 2, targetOnly: true, expected: 2 },
  { mode: "fixed", limit: 0, targetOnly: true, expected: null },
  { mode: "unlimited", limit: 3, targetOnly: false, expected: null },
])("preserves remaining-days arithmetic for $mode / $limit / $targetOnly", async (input) => {
  fixture.settings.budgetMode = input.mode;
  fixture.settings.inspectionDailyLimit = input.limit;
  fixture.rows = [
    reportRow("keyword", { source: "keyword_target" }),
    ...Array.from({ length: 3 }, (_, i) =>
      reportRow(`pending-${i}`, {
        checkedAt: null,
        source: input.targetOnly ? "keyword_target" : "sitemap",
      }),
    ),
  ];
  fixture.targets = fixture.rows.map(({ url }) => ({ targetUrl: url }));
  expect((await getPageIndexingReport("project", reportNow)).estimatedDaysRemaining).toBe(
    input.expected,
  );
});

it("reads candidate report columns once without a second URL-list query", async () => {
  await getPageIndexingReport("project", reportNow);
  expect(db.rows).toHaveBeenCalledTimes(1);
  expect(db.rows).toHaveBeenCalledWith({
    where: {
      projectId: "project",
      OR: [
        {
          url: {
            in: ["https://example.com/docs/keyword", "https://example.com/docs/unchecked-target"],
          },
        },
        {
          lastListedAt: reportNow,
          OR: [{ source: "sitemap" }, { sitemapUrl: { not: null } }],
        },
      ],
    },
    select: {
      url: true,
      checkedAt: true,
      inspectionError: true,
      verdict: true,
      coverageState: true,
      source: true,
    },
  });
});

it("does not truncate large candidate sets", async () => {
  fixture.rows = Array.from({ length: 10_005 }, (_, i) => reportRow(`page-${i}`));
  fixture.targets = fixture.rows.map(({ url }) => ({ targetUrl: url }));
  const report = await getPageIndexingReport("project", reportNow);
  expect(report).toMatchObject({ total: 10_005, checked: 10_005, complete: true });
  expect(db.rows).toHaveBeenCalledTimes(1);
});

it.each(["settings", "defaults", "targets", "rows"] as const)(
  "propagates %s failures without substituting an empty report",
  async (stage) => {
    const error = new Error(`${stage} unavailable`);
    db[stage].mockRejectedValueOnce(error);
    await expect(getPageIndexingReport("project", reportNow)).rejects.toBe(error);
    if (stage !== "rows") expect(db.rows).not.toHaveBeenCalled();
  },
);
