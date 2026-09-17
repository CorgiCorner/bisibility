import { expect, test } from "@playwright/test";

/**
 * The roadmap's navigation contract: the panel is a real URL, the browser's own
 * controls work on it, and the page stays usable without client scripting.
 *
 * The board is a hosted marketing surface. A self-host instance answers /roadmap
 * with the first-run setup redirect instead, so the suite reports that rather
 * than failing against an installation that never serves the page.
 */
test.describe("roadmap board", () => {
  test.beforeEach(async ({ page }) => {
    const response = await page.goto("/roadmap");
    test.skip(
      /\/setup(\?|$)/.test(page.url()) || response?.status() === 404,
      "This instance does not serve the hosted marketing roadmap.",
    );
  });

  test("opens a card, keeps the URL, and closes with Back", async ({ page }) => {
    await page.goto("/roadmap");

    await expect(page.getByRole("heading", { level: 1, name: "Roadmap" })).toBeVisible();
    await page.locator("#roadmap-card-market").click();

    await expect(page).toHaveURL(/\/roadmap\?feature=market$/);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText("Available in early use");

    await page.goBack();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).toHaveURL(/\/roadmap$/);
  });

  test("closes with Escape and returns focus to the card that opened it", async ({ page }) => {
    await page.goto("/roadmap");
    await page.locator("#roadmap-card-alerts").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.locator("#roadmap-card-alerts")).toBeFocused();
  });

  test("opens from the keyboard with a single tab stop per card", async ({ page }) => {
    await page.goto("/roadmap");
    await page.locator("#roadmap-card-i18n").focus();

    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/roadmap\?feature=i18n$/);
    await expect(page.getByRole("dialog")).toHaveAttribute("aria-labelledby", /.+/);
    await expect(page.locator("#roadmap-card-i18n button")).toHaveCount(0);
  });

  test("a link opened directly closes back to the board", async ({ page }) => {
    await page.goto("/roadmap?feature=slack");
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.getByRole("button", { name: "Close feature details" }).click();

    await expect(page).toHaveURL(/\/roadmap$/);
  });

  test("survives a refresh on a deep link", async ({ page }) => {
    await page.goto("/roadmap?feature=demo");
    await page.reload();

    await expect(page.getByRole("dialog")).toContainText("A read-only demo in early use.");
  });

  test("explains an unknown feature id instead of failing", async ({ page }) => {
    const response = await page.goto("/roadmap?feature=not-a-feature");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "Feature not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to roadmap" })).toBeVisible();
  });

  test("stays readable without client scripting", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto("/roadmap?feature=gsc-insights");
    const html = await page.content();

    expect(html).toContain("8 features on the board");
    expect(html).toContain("Available in beta with a connected Search Console property");
    await context.close();
  });
});
