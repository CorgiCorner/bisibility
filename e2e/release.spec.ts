import fs from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { completeOnboarding } from "./workspace";

const otpFile = process.env.BISIBILITY_E2E_OTP_FILE;
const authResponseTimeout = 30_000;
const authRedirectTimeout = 60_000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function latestOtpFor(email: string) {
  if (!otpFile) {
    throw new Error("BISIBILITY_E2E_OTP_FILE is required.");
  }

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const raw = await fs.readFile(otpFile, "utf8");
      const values = JSON.parse(raw) as Record<string, string>;
      const otp = values[email.toLowerCase()];
      if (otp) {
        return otp;
      }
    } catch {
      // The dev server writes this file asynchronously after the OTP is logged.
    }
    await sleep(250);
  }

  throw new Error(`OTP for ${email} was not captured.`);
}

async function expectSuccessfulAuthPost(page: Page, path: string, action: () => Promise<void>) {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" && new URL(candidate.url()).pathname === path,
    { timeout: authResponseTimeout },
  );
  await action();
  expect((await response).ok()).toBe(true);
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send login code" }).click();
  const firstBox = page.getByRole("textbox", { name: "Code", exact: true });
  await expect(firstBox).toBeVisible();
  // Six single-digit boxes with auto-advance: focus the first and type the code,
  // letting focus move box-to-box as a real user would.
  await firstBox.focus();
  await page.keyboard.type(await latestOtpFor(email));
  await expectSuccessfulAuthPost(page, "/api/auth/sign-in/email-otp", () =>
    page.getByRole("button", { name: "Verify & continue" }).click(),
  );
  await page.waitForURL((url) => url.pathname === "/app" || url.pathname === "/onboarding", {
    timeout: authRedirectTimeout,
    waitUntil: "commit",
  });
  await expect(page).toHaveURL(/\/onboarding(\?|$)/, { timeout: authRedirectTimeout });
}

async function expectAppPage(page: Page, path: string, assertVisible: () => Promise<void>) {
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}$`)); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp - path is a fixed test route, not user input.
  await assertVisible();
}

async function clickThroughAppPages(page: Page, keyword: string, projectRef: string) {
  await expectAppPage(page, `/app/${projectRef}/overview`, async () => {
    await expect(page.getByText("Tracked keywords")).toBeVisible();
  });

  await expectAppPage(page, `/app/${projectRef}/rank-tracker`, async () => {
    await expect(page.getByText(keyword).first()).toBeVisible();
  });
  await page.getByRole("link", { name: "View keyword details" }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname.startsWith(`/app/${projectRef}/rank-tracker/kw_`),
    { timeout: 30_000 },
  );
  await expect(page.getByRole("link", { name: "All keywords" })).toBeVisible();
  await expect(page.getByRole("heading", { name: keyword }).first()).toBeVisible();
  const keywordDetailPath = new URL(page.url()).pathname;

  // The route-aware app header renders the page title as an h1, so several titles now
  // match both the header and a content heading - assert exact + first.
  await expectAppPage(page, `/app/${projectRef}/integrations`, async () => {
    await expect(
      page.getByRole("heading", { name: "Integrations", exact: true }).first(),
    ).toBeVisible();
  });
  await expectAppPage(page, `/app/${projectRef}/settings/general`, async () => {
    await expect(page.getByText("Project details")).toBeVisible();
  });
  // /app/docs hands off to the hosted docs site via a streamed redirect (HTTP 200 +
  // meta refresh), so assert only that the browser leaves the in-app route.
  await page.goto(`/app/${projectRef}/docs`);
  await expect(page).not.toHaveURL((url) => url.pathname === `/app/${projectRef}/docs`);
  await expectAppPage(page, `/app/${projectRef}/competitors`, async () => {
    await expect(
      page.getByRole("heading", { name: "Competitors", exact: true }).first(),
    ).toBeVisible();
  });
  await expectAppPage(page, `/app/${projectRef}/alerts`, async () => {
    await expect(page.getByRole("heading", { name: "Alerts", exact: true }).first()).toBeVisible();
  });

  return keywordDetailPath;
}

async function verifyWorkspaceWidths(page: Page, keywordDetailPath: string, projectRef: string) {
  const analyticsPaths = [
    `/app/${projectRef}/rank-tracker`,
    keywordDetailPath,
    `/app/${projectRef}/rank-tracker?tab=checks`,
    `/app/${projectRef}/timeline`,
    `/app/${projectRef}/competitors`,
  ];

  for (const width of [1024, 1440, 1920]) {
    await page.setViewportSize({ height: 1000, width });
    for (const path of analyticsPaths) {
      await page.goto(path);
      const metrics = await page.locator("main").evaluate((main) => {
        const content = main.firstElementChild as HTMLElement | null;
        const style = getComputedStyle(main);
        const available =
          main.clientWidth -
          Number.parseFloat(style.paddingLeft) -
          Number.parseFloat(style.paddingRight);
        return {
          available,
          contentWidth: content?.getBoundingClientRect().width ?? 0,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      expect(metrics.overflow, `${path} overflows at ${width}px`).toBe(false);
      expect(metrics.contentWidth).toBeCloseTo(Math.min(metrics.available, 1400), 0);
    }
  }

  await page.goto(`/app/${projectRef}/settings/general`);
  const settingsWidth = await page
    .locator("main > div")
    .first()
    .evaluate((node) => node.getBoundingClientRect().width);
  expect(settingsWidth).toBeCloseTo(1040, 0);

  await page.goto("/app/account");
  const accountWidth = await page
    .locator("main > div")
    .first()
    .evaluate((node) => node.getBoundingClientRect().width);
  expect(accountWidth).toBeLessThanOrEqual(781);
}

test("release flow: auth, onboarding, app pages, keyword detail, logout", async ({ page }) => {
  test.setTimeout(360_000);
  const suffix = Date.now().toString(36);
  const email = `e2e-${suffix}@example.com`;

  await signIn(page, email);
  const { keyword, projectRef } = await completeOnboarding(page, suffix);
  const keywordDetailPath = await clickThroughAppPages(page, keyword, projectRef);
  await verifyWorkspaceWidths(page, keywordDetailPath, projectRef);

  // Sign out now lives inside the sidebar user (Account) menu.
  await page.getByRole("button", { name: "Account menu" }).focus();
  await page.keyboard.press("Enter");
  await expectSuccessfulAuthPost(page, "/api/auth/sign-out", () =>
    page.getByRole("menuitem", { name: "Sign out" }).click(),
  );
  await page.waitForURL((url) => url.pathname === "/login", {
    timeout: authRedirectTimeout,
    waitUntil: "commit",
  });

  await page.goto(`/app/${projectRef}/overview`);
  await expect(page).toHaveURL((url) => url.pathname === "/login");
});
