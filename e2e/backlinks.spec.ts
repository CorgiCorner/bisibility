import { expect, test } from "@playwright/test";
import { completeOnboarding, signIn } from "./workspace";

test("backlinks smoke: analyze, filter, expand, and load more", async ({ page }) => {
  test.setTimeout(240_000);
  const suffix = `backlinks-${Date.now().toString(36)}`;
  const email = `e2e-${suffix}@example.com`;

  await signIn(page, email);
  const { projectRef } = await completeOnboarding(page, suffix);
  await page.goto(`/app/${projectRef}/backlinks`);

  await expect(page.getByText("Point it at any domain")).toBeVisible();
  const analyze = page.getByRole("button", { name: "Analyze", exact: true });
  await expect(analyze).toBeDisabled();
  await page.getByRole("textbox", { name: "Backlinks target" }).fill("example.com");
  const pricedAnalyze = page.getByRole("button", { name: "Analyze ~$0.05" });
  await expect(pricedAnalyze).toBeEnabled();

  await pricedAnalyze.click();
  await expect(page.getByRole("region", { name: "Backlinks results" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Backlink totals" })).toContainText("220");
  await expect(page.getByRole("region", { name: "Profile health" })).toContainText("Domain rank");
  await expect(page.getByText("alpha.example")).toBeVisible();
  await expect(page.getByText("Fetched 100 of 220 links")).toBeVisible();

  await page.getByRole("button", { name: "Expand alpha.example" }).click();
  await expect(page.getByRole("button", { name: "Collapse alpha.example" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.getByRole("button", { name: "Broken 0" }).click();
  await expect(page.getByText("No broken backlinks")).toBeVisible();
  await expect(page.getByRole("button", { name: /Load 100 more/ })).toHaveCount(0);
  await page.getByRole("button", { name: "All 219 domains" }).click();

  await page.getByRole("button", { name: "Filters 0" }).click();
  const minimumAuthority = page.getByRole("slider", { name: "Domain authority minimum" });
  await minimumAuthority.press("Home");
  for (let step = 0; step < 5; step += 1) await minimumAuthority.press("PageUp");
  await expect(minimumAuthority).toHaveAttribute("aria-valuenow", "50");
  await page.getByRole("button", { name: "Show 49 domains" }).click();
  await expect(page.getByText("Showing 49 of 219 domains")).toBeVisible();

  await page.getByRole("button", { name: "Filters 1" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Close sheet" })).toHaveCount(0);
  await page.getByRole("button", { name: "Filters 1" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("button", { name: "Show 99 domains" }).click();

  await page.getByRole("button", { name: "Load 100 more ~$0.01" }).click();
  await expect(page.getByText("source-149.example")).toBeVisible();
  await expect(page.getByText("Fetched 200 of 220 links")).toBeVisible();
  await expect(page.getByText("Showing 199 of 219 domains")).toBeVisible();
});
