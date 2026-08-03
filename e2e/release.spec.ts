import fs from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const otpFile = process.env.BISIBILITY_E2E_OTP_FILE;

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
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(page).toHaveURL(/\/onboarding(\?|$)/);
}

async function clickWizardPrimary(page: Page, label: string, nextUrl: RegExp) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  const button = page.getByRole("button", { name: label, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(nextUrl, { timeout: 10000 });
}

// The hydrated provider step submits twice to connect then advance; pre-hydration
// reloads may add an attempt, so loop until navigation completes.
async function clickProviderContinue(page: Page, nextUrl: RegExp) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    try {
      await expect(page).toHaveURL(nextUrl, { timeout: 4000 });
      return;
    } catch {
      await page.waitForLoadState("networkidle");
    }
  }
  await expect(page).toHaveURL(nextUrl, { timeout: 10000 });
}

async function completeOnboarding(page: Page, suffix: string) {
  const domain = `e2e-${suffix}.example.com`;
  const keyword = `rank tracker ${suffix}`;

  await page.goto("/onboarding");

  // Step 1 - Create project (matching scope lives here now, recommended preselected).
  // exact: true - the matching-scope card labels also contain the word "domain".
  await page.getByLabel("Domain", { exact: true }).fill(domain);
  await page.getByLabel("Project name").fill(`E2E ${suffix}`);
  await clickWizardPrimary(page, "Continue", /[?&]step=2(?:&|$)/);

  // Step 2 - Developer access is optional for dashboard-only use.
  await clickWizardPrimary(page, "Continue", /[?&]step=3(?:&|$)/);

  // Step 3 - Connect provider (fake-provider test + connect, then advance)
  await page.getByLabel("API login").fill("fake-login");
  // Role textbox - the reveal-toggle button's aria-label also contains "API password".
  await page.getByRole("textbox", { name: /API password/ }).fill("fake-secret");
  // Continue stays disabled until a successful "Test connection" while the project has
  // no primary provider yet, so run the test first and wait for the gate to open.
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled({
    timeout: 15000,
  });
  await clickProviderContinue(page, /[?&]step=4(?:&|$)/);

  // Step 4 - Tracking defaults (defaults preselected)
  await clickWizardPrimary(page, "Continue", /[?&]step=5(?:&|$)/);

  // Step 5 - Add keywords
  await page.getByPlaceholder("One keyword per line").fill(keyword);
  await clickWizardPrimary(page, "Continue", /[?&]step=6(?:&|$)/);

  // Step 6 - First check (queues the checks, then opens the dashboard)
  await clickWizardPrimary(page, "Open dashboard", /\/app\/prj_[^/]+\/overview$/);

  const projectRef = new URL(page.url()).pathname.split("/")[2];
  if (!projectRef) throw new Error("Onboarding did not land on a project-scoped dashboard.");
  return { keyword, projectRef };
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

  await expectAppPage(page, `/app/${projectRef}/keywords`, async () => {
    await expect(page.getByText(keyword).first()).toBeVisible();
  });
  await page.getByRole("link", { name: "View keyword details" }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname.startsWith(`/app/${projectRef}/keywords/kw_`),
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
  await expectAppPage(page, `/app/${projectRef}/settings`, async () => {
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
    `/app/${projectRef}/keywords`,
    keywordDetailPath,
    `/app/${projectRef}/checks`,
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

  for (const path of [`/app/${projectRef}/settings`, "/app/account"]) {
    await page.goto(path);
    const width = await page
      .locator("main > div")
      .first()
      .evaluate((node) => node.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(781);
  }
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
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/login", { timeout: 30_000 });

  await page.goto(`/app/${projectRef}/overview`);
  await expect(page).toHaveURL((url) => url.pathname === "/login");
});
