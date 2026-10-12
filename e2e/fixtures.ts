import { expect, test as nativeTest } from "@playwright/test";
import { attachOperaForTests } from "../scripts/smoke/attached-opera-playwright.mjs";

// CI keeps its native runner. Local tests use fresh contexts in the visible attached Opera.
export const test =
  process.env.CI === "true"
    ? nativeTest
    : nativeTest.extend({
        browser: [
          async ({ browserName }, use) => {
            if (browserName !== "chromium")
              throw new Error("Attached browser tests require Chromium.");
            const attachment = await attachOperaForTests();
            try {
              await use(attachment.browser);
            } finally {
              await attachment.dispose();
            }
          },
          { scope: "worker" },
        ],
      });
export type { Locator, Page } from "@playwright/test";
export { expect };
