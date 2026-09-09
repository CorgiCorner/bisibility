import fs from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { completeOnboarding } from "./workspace";

const otpFile = process.env.BISIBILITY_E2E_OTP_FILE;
const authResponseTimeout = 60_000;
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
    page.getByRole("button", { name: "Verify and continue" }).click(),
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

async function enableExperimentalModules(page: Page, projectRef: string) {
  const path = `/app/${projectRef}/settings/experimental`;
  const moduleLabels = ["Timeline", "Competitors"] as const;
  await expectAppPage(page, path, async () => {
    for (const label of moduleLabels) {
      const experimentalModule = page.getByRole("switch", { name: label, exact: true });
      await expect(experimentalModule).toBeEnabled();
      await expect(experimentalModule).not.toBeChecked();
      await experimentalModule.focus();
      const saved = page.waitForResponse(
        (candidate) =>
          candidate.request().method() === "POST" && new URL(candidate.url()).pathname === path,
        { timeout: 30_000 },
      );
      const [response] = await Promise.all([saved, page.keyboard.press("Space")]);
      expect(response.ok()).toBe(true);
      await expect(experimentalModule).toBeChecked();
    }
  });

  await page.reload();
  for (const label of moduleLabels) {
    await expect(page.getByRole("switch", { name: label, exact: true })).toBeChecked();
  }
}

async function clickThroughAppPages(page: Page, keyword: string, projectRef: string) {
  await expectAppPage(page, `/app/${projectRef}/dashboard`, async () => {
    await expect(
      page.getByRole("region", { name: "Overview KPIs" }).getByText("Tracked keywords"),
    ).toBeVisible();
  });

  const rankTrackerTable = page.getByRole("table", { name: "Rank tracker keywords" });
  const keywordLink = rankTrackerTable.getByRole("link", { name: keyword, exact: true });
  await expectAppPage(page, `/app/${projectRef}/rank-tracker`, async () => {
    await expect(keywordLink).toBeVisible();
  });
  await keywordLink.click();
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
    await expect(
      page.getByRole("heading", { name: "Project details", exact: true }).first(),
    ).toBeVisible();
  });
  // /app/docs hands off to the hosted docs site via a streamed redirect (HTTP 200 +
  // meta refresh), so assert only that the browser leaves the in-app route.
  await page.goto(`/app/${projectRef}/docs`);
  await expect(page).not.toHaveURL((url) => url.pathname === `/app/${projectRef}/docs`);
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
  ];

  for (const width of [1024, 1440, 1920]) {
    await page.setViewportSize({ height: 1000, width });
    for (const path of analyticsPaths) {
      await page.goto(path);
      const main = page.locator("main:visible").last();
      await expect(main).toBeVisible();
      await expect
        .poll(() => main.evaluate((node) => node.clientWidth), {
          message: `${path} main should finish laying out at ${width}px`,
        })
        .toBeGreaterThan(0);
      await expect
        .poll(
          () => main.evaluate((node) => node.firstElementChild?.getBoundingClientRect().width ?? 0),
          { message: `${path} content should finish laying out at ${width}px` },
        )
        .toBeGreaterThan(0);
      const metrics = await main.evaluate((node) => {
        const content = node.firstElementChild as HTMLElement | null;
        const style = getComputedStyle(node);
        const available =
          node.clientWidth -
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

  for (const [path, selector] of [
    [`/app/${projectRef}/settings/general`, "[data-settings-shell]"],
    ["/app/account", "[data-account-shell]"],
  ] as const) {
    await expectAppPage(page, path, async () => {
      // Streamed shells can be attached before their content is revealed.
      const shell = page.locator(`main:visible ${selector}:visible`);
      await expect(shell).toHaveCount(1);
      await expect
        .poll(() => shell.evaluate((node) => node.getBoundingClientRect().width), {
          message: `${path} visible shell should finish laying out at 1040px`,
        })
        .toBeCloseTo(1040, 0);
    });
  }
}

test("no-key runtime makes no third-party requests and renders no consent banner", async ({
  page,
}) => {
  test.skip(Boolean(process.env.E2E_POSTHOG_KEY), "This guard requires the no-key runtime.");
  const appHost = new URL(process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100").host;
  const thirdPartyHosts = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.host !== appHost) {
      thirdPartyHosts.add(url.host);
    }
  });

  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  expect([...thirdPartyHosts]).toEqual([]);
  await expect(page.getByLabel("Analytics consent")).toHaveCount(0);
});

test("release flow: auth, onboarding, app pages, keyword detail, logout", async ({ page }) => {
  test.setTimeout(360_000);
  const suffix = Date.now().toString(36);
  const email = `e2e-${suffix}@example.com`;

  await signIn(page, email);
  const { keyword, projectRef } = await completeOnboarding(page, suffix);
  await enableExperimentalModules(page, projectRef);
  const keywordDetailPath = await clickThroughAppPages(page, keyword, projectRef);
  await verifyWorkspaceWidths(page, keywordDetailPath, projectRef);

  // Sign out now lives inside the sidebar user (Account) menu.
  const accountMenu = page.getByRole("button", { name: "Account menu" });
  await accountMenu.click();
  const signOut = page.getByRole("menuitem", { name: "Sign out" });
  await expect(signOut).toBeVisible();
  await expect(signOut).toBeEnabled();
  await expectSuccessfulAuthPost(page, "/api/auth/sign-out", () => signOut.click());
  await page.waitForURL((url) => url.pathname === "/login", {
    timeout: authRedirectTimeout,
    waitUntil: "commit",
  });

  await page.goto(`/app/${projectRef}/dashboard`);
  await expect(page).toHaveURL((url) => url.pathname === "/login");
});
