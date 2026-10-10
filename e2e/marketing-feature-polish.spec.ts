import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  for (const feature of ["api", "mcp-server"]) {
    test(`${feature} code copy stays clear of the snippet at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/features/${feature}`);
      await expect(page.getByRole("tablist").first()).toBeVisible();
      for (const tablist of await page.getByRole("tablist").all()) {
        for (const tab of await tablist.getByRole("tab").all()) {
          await tab.click();
          await expect(tab).toHaveAttribute("aria-selected", "true");
          const panel = page.locator(`[id="${await tab.getAttribute("aria-controls")}"]`);
          const copy = panel.getByRole("button", { name: /^Copy/ });
          const code = panel.locator("pre").first();
          await copy.scrollIntoViewIfNeeded();
          const copyBox = await copy.boundingBox();
          const codeBox = await code.boundingBox();
          if (!copyBox || !codeBox) throw new Error("The active code panel must be visible");
          expect(copyBox.y + copyBox.height).toBeLessThanOrEqual(codeBox.y);
          if (width < 768) expect(copyBox.height).toBeGreaterThanOrEqual(44);
          await expect(code).toHaveAttribute("tabindex", "0");
          expect(await code.evaluate((element) => getComputedStyle(element).overflowX)).toBe(
            "auto",
          );
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    });
  }
}
