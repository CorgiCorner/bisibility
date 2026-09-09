import { expect, type Locator, type Page, test } from "@playwright/test";
import { rankTrackerBody, rankTrackerTable } from "./rank-tracker-data-table-helpers";
import {
  cleanupRankTrackerGroupedServerFixture,
  createRankTrackerGroupedServerFixture,
  groupedLeafRows,
  type RankTrackerGroupedServerFixture,
} from "./rank-tracker-grouped-server-helpers";
import { completeOnboarding, signIn } from "./workspace";

function hasQuery(path: string, expected: Record<string, string>): (url: URL) => boolean {
  return (url) =>
    url.pathname === path &&
    Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value);
}

function groupedUrl(path: string, params: Record<string, string>) {
  return `${path}?${new URLSearchParams({ grouped: "1", pageSize: "25", ...params }).toString()}`;
}

async function expectMountedTopLevelRows(body: Locator, logicalPageSize: number) {
  const rows = body.locator('[role="row"][data-depth="0"]');
  await expect(rows.first()).toBeVisible();
  const mountedCount = await rows.count();
  expect(mountedCount).toBeGreaterThan(0);
  expect(mountedCount).toBeLessThanOrEqual(logicalPageSize);
}

async function expectFilteredGroup(
  page: Page,
  trackerPath: string,
  fixture: RankTrackerGroupedServerFixture,
  params: Record<string, string>,
  leafCount = 4,
) {
  await page.goto(groupedUrl(trackerPath, params));
  await expect(page).toHaveURL(hasQuery(trackerPath, { grouped: "1", pageSize: "25", ...params }));
  await expect(rankTrackerTable(page)).toHaveAttribute("aria-rowcount", "1");
  const group = rankTrackerBody(page)
    .locator('[role="row"][data-depth="0"]')
    .filter({ hasText: fixture.filterKeyword });
  await expect(group).toHaveCount(1);
  await expect(group).toContainText(
    `${leafCount === 4 ? "2 markets" : "1 market"} / ${leafCount} active targets`,
  );
  await group.getByRole("button", { name: `Expand ${fixture.filterKeyword}` }).click();
  const leaves = groupedLeafRows(rankTrackerBody(page), fixture.filterKeyword);
  await expect(leaves).toHaveCount(leafCount);
  await expect(leaves).toContainText(Array(leafCount).fill(fixture.filterKeyword));
}

test("Rank Tracker serves grouped URL filters, counts, and matching leaves", async ({ page }) => {
  test.setTimeout(240_000);
  const suffix = `rank-grouped-${Date.now().toString(36)}`;
  const email = `e2e-${suffix}@example.com`;
  let fixture: RankTrackerGroupedServerFixture | undefined;

  try {
    await signIn(page, email);
    const { projectRef } = await completeOnboarding(page, suffix);
    fixture = await createRankTrackerGroupedServerFixture(projectRef, suffix);
    const trackerPath = `/app/${projectRef}/rank-tracker`;
    const broadFilter = { contains: `rt-gs-${suffix}` };

    await page.goto(groupedUrl(trackerPath, broadFilter));
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await expect(
      page.getByRole("group", { name: "Keyword grouping" }).getByRole("radio", { name: "Grouped" }),
    ).toBeChecked();
    await expect(rankTrackerTable(page)).toHaveAttribute("aria-rowcount", "251");
    expect(fixture.targetCount).toBe(1_004);
    await expect(page.getByText("1,004 matching targets", { exact: true })).toBeVisible();
    await expect(page.getByText(/1,000/)).toHaveCount(0);
    await expectMountedTopLevelRows(rankTrackerBody(page), 25);
    await expect(page.getByText("1-25 of 251", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(
      hasQuery(trackerPath, { ...broadFilter, grouped: "1", page: "2", pageSize: "25" }),
    );
    await expectMountedTopLevelRows(rankTrackerBody(page), 25);
    await expect(page.getByText("26-50 of 251", { exact: true })).toBeVisible();

    const tag = `rt-gs-${suffix} filter`;
    const topic = `rt-gs-${suffix} topic`;
    const filters: ReadonlyArray<Record<string, string>> = [
      { position: "top3" },
      { change: "up" },
      { volMax: "20", volMin: "10" },
      { contains: "filter target" },
      { tags: tag },
      { topics: topic },
      { intents: "commercial" },
      { serp: "image" },
      { lastCheck: "completed" },
      { wrongUrl: "1" },
      { urlChanged: "1" },
      { q: fixture.filterKeyword },
    ];
    for (const params of filters) {
      await expectFilteredGroup(page, trackerPath, fixture, params);
    }
    await expectFilteredGroup(
      page,
      trackerPath,
      fixture,
      { location: fixture.locationKey, q: fixture.filterKeyword },
      2,
    );
  } finally {
    if (fixture) await cleanupRankTrackerGroupedServerFixture(fixture);
  }
});
