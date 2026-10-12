import { expect, type Locator, test } from "./fixtures";
import {
  cleanupRankTrackerDataTableFixture,
  createRankTrackerDataTableFixture,
  type RankTrackerDataTableFixture,
  rankTrackerBody,
  rankTrackerTable,
} from "./rank-tracker-data-table-helpers";
import { setOwnedProjectMarketCount } from "./rank-tracker-market-mode-helpers";
import { completeOnboarding, signIn } from "./workspace";

function hasQuery(path: string, expected: Record<string, string>): (url: URL) => boolean {
  return (url) =>
    url.pathname === path &&
    Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value);
}

async function expectMountedTopLevelRows(body: Locator, logicalPageSize: number) {
  const rows = body.locator('[role="row"][data-depth="0"]');
  await expect(rows.first()).toBeVisible();
  const mountedCount = await rows.count();
  expect(mountedCount).toBeGreaterThan(0);
  expect(mountedCount).toBeLessThanOrEqual(logicalPageSize);
}

for (const marketCount of [0, 1] as const) {
  test(`Rank Tracker uses flat selection, sorting, pagination, and detail navigation with ${marketCount} markets`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const suffix = `rank-table-${Date.now().toString(36)}`;
    const email = `e2e-${suffix}@example.com`;
    let fixture: RankTrackerDataTableFixture | undefined;

    try {
      await signIn(page, email);
      const { projectRef } = await completeOnboarding(page, suffix);
      fixture = await createRankTrackerDataTableFixture(projectRef, suffix);
      await setOwnedProjectMarketCount(projectRef, marketCount);
      const trackerPath = `/app/${projectRef}/rank-tracker`;

      await page.goto(`${trackerPath}?page=1&pageSize=25`);
      await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
      await expect(page).toHaveURL(hasQuery(trackerPath, { page: "1", pageSize: "25" }));
      await expect(rankTrackerTable(page)).toHaveAttribute("aria-rowcount", "50");
      await expectMountedTopLevelRows(rankTrackerBody(page), 25);
      await expect(page.getByText("1-25 of 50", { exact: true })).toBeVisible();

      await expect(
        rankTrackerBody(page).getByRole("button", { name: /^Expand |^Collapse / }),
      ).toHaveCount(0);
      const mounted = rankTrackerBody(page).locator('[role="row"][data-depth="0"]');
      await mounted.nth(0).getByRole("checkbox").check();
      await mounted.nth(1).getByRole("checkbox").check();
      const selectionActions = page.getByRole("toolbar", { name: "Actions for selected keywords" });
      await expect(selectionActions.getByText("2 selected", { exact: true })).toBeVisible();
      await selectionActions.getByRole("button", { name: "Clear", exact: true }).click();
      await expect(selectionActions).toBeHidden();

      await page.getByRole("button", { name: "Sort Position descending" }).click();
      await expect(page).toHaveURL(
        hasQuery(trackerPath, {
          dir: "desc",
          page: "1",
          pageSize: "25",
          sort: "position",
        }),
      );
      await expect(page.getByRole("button", { name: "Clear Position sorting" })).toBeVisible();

      await page.getByRole("button", { name: "Next page" }).click();
      await expect(page).toHaveURL(
        hasQuery(trackerPath, { dir: "desc", page: "2", pageSize: "25" }),
      );
      await expectMountedTopLevelRows(rankTrackerBody(page), 25);
      await expect(page.getByText("26-50 of 50", { exact: true })).toBeVisible();

      const search = new URLSearchParams({
        pageSize: "25",
        q: fixture.navigationKeyword,
      });
      await page.goto(`${trackerPath}?${search.toString()}`);
      const navigationRow = rankTrackerBody(page)
        .getByRole("row")
        .filter({ hasText: fixture.navigationKeyword });
      await expect(navigationRow).toHaveCount(1);
      await navigationRow.getByText(fixture.navigationKeyword, { exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname.startsWith(`${trackerPath}/kw_`));
      await expect(page.getByRole("link", { name: "All keywords" })).toBeVisible();
    } finally {
      if (fixture) await cleanupRankTrackerDataTableFixture(fixture);
    }
  });
}
