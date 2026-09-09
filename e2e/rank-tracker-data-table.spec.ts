import { expect, type Locator, test } from "@playwright/test";
import {
  cleanupRankTrackerDataTableFixture,
  createRankTrackerDataTableFixture,
  groupedLeafRows,
  type RankTrackerDataTableFixture,
  rankTrackerBody,
  rankTrackerTable,
} from "./rank-tracker-data-table-helpers";
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

test("Rank Tracker DataTable supports grouped and flat user flows", async ({ page }) => {
  test.setTimeout(240_000);
  const suffix = `rank-table-${Date.now().toString(36)}`;
  const email = `e2e-${suffix}@example.com`;
  let fixture: RankTrackerDataTableFixture | undefined;

  try {
    await signIn(page, email);
    const { projectRef } = await completeOnboarding(page, suffix);
    fixture = await createRankTrackerDataTableFixture(projectRef, suffix);
    const trackerPath = `/app/${projectRef}/rank-tracker`;

    await page.goto(`${trackerPath}?grouped=1&pageSize=25`);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    const grouping = page.getByRole("group", { name: "Keyword grouping" });
    await expect(grouping.getByRole("radio", { name: "Grouped" })).toBeChecked();
    await expect(rankTrackerTable(page)).toHaveAttribute("aria-rowcount", "14");
    await expect(rankTrackerBody(page)).toBeVisible();

    const expand = page.getByRole("button", {
      name: `Expand ${fixture.firstGroupedKeyword}`,
    });
    await expand.click();
    await expect(
      page.getByRole("button", { name: `Collapse ${fixture.firstGroupedKeyword}` }),
    ).toHaveAttribute("aria-expanded", "true");
    const children = groupedLeafRows(rankTrackerBody(page), fixture.firstGroupedKeyword);
    await expect(children).toHaveCount(4);

    await page.getByRole("button", { name: `Collapse ${fixture.firstGroupedKeyword}` }).click();
    await expect(children).toHaveCount(0);
    await page.getByRole("button", { name: `Expand ${fixture.firstGroupedKeyword}` }).click();
    const expandedChildren = groupedLeafRows(rankTrackerBody(page), fixture.firstGroupedKeyword);
    await expandedChildren
      .nth(0)
      .getByRole("checkbox", { name: `Select ${fixture.firstGroupedKeyword}` })
      .check();
    await expandedChildren
      .nth(1)
      .getByRole("checkbox", { name: `Select ${fixture.firstGroupedKeyword}` })
      .check();
    await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Clear", exact: true }).click();

    await grouping.getByText("Flat", { exact: true }).click();
    await expect(page).toHaveURL(hasQuery(trackerPath, { grouped: "0", pageSize: "25" }));
    await expect(grouping.getByRole("radio", { name: "Flat" })).toBeChecked();
    await expect(rankTrackerTable(page)).toHaveAttribute("aria-rowcount", "50");
    await expectMountedTopLevelRows(rankTrackerBody(page), 25);
    await expect(
      rankTrackerBody(page).getByRole("button", { name: /^Expand |^Collapse / }),
    ).toHaveCount(0);
    await expect(page.getByText("1-25 of 50", { exact: true })).toBeVisible();

    await page.goto(`${trackerPath}?grouped=0&page=1&pageSize=25`);
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await expect(page).toHaveURL(
      hasQuery(trackerPath, { grouped: "0", page: "1", pageSize: "25" }),
    );
    await expect(
      page.getByRole("group", { name: "Keyword grouping" }).getByRole("radio", { name: "Flat" }),
    ).toBeChecked();
    await expect(rankTrackerTable(page)).toHaveAttribute("aria-rowcount", "50");
    await expectMountedTopLevelRows(rankTrackerBody(page), 25);
    await expect(page.getByText("1-25 of 50", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Sort Position descending" }).click();
    await expect(page).toHaveURL(
      hasQuery(trackerPath, {
        dir: "desc",
        grouped: "0",
        page: "1",
        pageSize: "25",
        sort: "position",
      }),
    );
    await expect(page.getByRole("button", { name: "Clear Position sorting" })).toBeVisible();

    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(
      hasQuery(trackerPath, { dir: "desc", grouped: "0", page: "2", pageSize: "25" }),
    );
    await expectMountedTopLevelRows(rankTrackerBody(page), 25);
    await expect(page.getByText("26-50 of 50", { exact: true })).toBeVisible();

    const search = new URLSearchParams({
      grouped: "0",
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
