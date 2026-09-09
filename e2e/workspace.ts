import fs from "node:fs/promises";
import { expect, type Page } from "@playwright/test";

const otpFile = process.env.BISIBILITY_E2E_OTP_FILE;
const wizardNavigationTimeout = 30_000;

function sleep(ms: number) {
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
      const otp = (JSON.parse(raw) as Record<string, string>)[email.toLowerCase()];
      if (otp) return otp;
    } catch {
      // The dev server writes the capture asynchronously.
    }
    await sleep(250);
  }

  throw new Error(`OTP for ${email} was not captured.`);
}

export async function signIn(page: Page, email: string, options: { navigate?: boolean } = {}) {
  if (options.navigate !== false) await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send login code" }).click();
  const firstBox = page.getByRole("textbox", { name: "Code", exact: true });
  await expect(firstBox).toBeVisible();
  await firstBox.focus();
  await page.keyboard.type(await latestOtpFor(email));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL(/\/(app\/[^/]+\/dashboard|onboarding)(\?|$)/);
}

async function clickWizardPrimary(page: Page, label: string, nextUrl: RegExp) {
  await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
  const button = page.getByRole("button", { name: label, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page).toHaveURL(nextUrl, { timeout: wizardNavigationTimeout });
}

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
  await expect(page).toHaveURL(nextUrl, { timeout: wizardNavigationTimeout });
}

export async function testAndSaveDataForSeo(page: Page) {
  const status = page.getByRole("status");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await expect(page.locator("html")).toHaveAttribute("data-hydrated", "true");
    await page.getByLabel("API login").fill("fake-login");
    await page.getByRole("textbox", { name: /API password/ }).fill("fake-secret");
    const testButton = page.getByRole("button", { name: "Test connection", exact: true });
    try {
      await expect(testButton).toBeEnabled({ timeout: 5000 });
      await testButton.click();
      await expect(status).toContainText("DataForSEO verified", { timeout: 10_000 });
      break;
    } catch (error) {
      if (attempt === 1) throw error;
      // The first Next 16 dev compilation can reload the route after the idempotent
      // connection test, dropping its client result. Refill and retry once after hydration.
      await page.waitForLoadState("networkidle");
    }
  }
  const saveButton = page.getByRole("button", { name: "Save connection", exact: true });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(page.getByRole("status")).toContainText("DataForSEO connected", {
    timeout: 15000,
  });
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
}

export async function completeOnboarding(
  page: Page,
  suffix: string,
  options: { runPreview?: boolean; skipProvider?: boolean } = {},
) {
  const domain = `e2e-${suffix}.example.com`;
  const keyword = `rank tracker ${suffix}`;

  await page.goto("/onboarding");
  const website = page.getByLabel("Your website", { exact: true });
  await expect(website).toBeVisible();
  await website.fill(domain);
  await clickWizardPrimary(page, "Continue", /[?&]step=2(?:&|$)/);

  if (options.skipProvider) {
    // The wizard passes onSkip, so the affordance renders as a button; it falls back to a
    // link when only an href is supplied. Match either rather than pinning one role.
    await page
      .getByRole("button", { name: /Skip provider connection/ })
      .or(page.getByRole("link", { name: /Skip provider connection/ }))
      .click();
    await expect(page).toHaveURL(/[?&]step=3(?:&|$)/, { timeout: wizardNavigationTimeout });
  } else {
    await testAndSaveDataForSeo(page);
    await clickProviderContinue(page, /[?&]step=3(?:&|$)/);
  }

  await page.getByPlaceholder("One keyword per line").fill(keyword);
  await clickWizardPrimary(page, "Continue", /[?&]step=4(?:&|$)/);
  if (options.runPreview) {
    const runCheck = page.getByRole("button", { name: "Run check", exact: true });
    await expect(runCheck).toBeEnabled();
    await runCheck.click();
    await expect(page.getByText(/Sample checks are queued|recorded cost/)).toBeVisible();
  }
  await clickWizardPrimary(page, "Open app", /\/app\/prj_[^/]+\/getting-started$/);

  const projectRef = new URL(page.url()).pathname.split("/")[2];
  if (!projectRef) throw new Error("Onboarding did not land on project-scoped getting started.");
  return { keyword, projectRef };
}
