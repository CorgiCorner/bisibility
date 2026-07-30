import fs from "node:fs/promises";
import { expect, type Page } from "@playwright/test";

const otpFile = process.env.BISIBILITY_E2E_OTP_FILE;

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

export async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send login code" }).click();
  const firstBox = page.getByRole("textbox", { name: "Code", exact: true });
  await expect(firstBox).toBeVisible();
  await firstBox.focus();
  await page.keyboard.type(await latestOtpFor(email));
  await page.getByRole("button", { name: "Verify & continue" }).click();
  await expect(page).toHaveURL(/\/(app\/overview|onboarding)(\?|$)/);
}

async function clickWizardPrimary(page: Page, label: string, nextUrl: RegExp) {
  const button = page.getByRole("button", { name: label, exact: true });
  await expect(button).toBeEnabled();
  await button.click();
  try {
    await expect(page).toHaveURL(nextUrl, { timeout: 5000 });
  } catch {
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page).toHaveURL(nextUrl, { timeout: 10000 });
  }
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
  await expect(page).toHaveURL(nextUrl, { timeout: 10000 });
}

export async function completeOnboarding(page: Page, suffix: string) {
  const domain = `e2e-${suffix}.example.com`;
  const keyword = `rank tracker ${suffix}`;

  await page.goto("/onboarding");
  await page.getByLabel("Domain", { exact: true }).fill(domain);
  await page.getByLabel("Project name").fill(`E2E ${suffix}`);
  await clickWizardPrimary(page, "Continue", /[?&]step=2(?:&|$)/);
  await clickWizardPrimary(page, "Continue", /[?&]step=3(?:&|$)/);

  await page.getByLabel("API login").fill("fake-login");
  await page.getByRole("textbox", { name: /API password/ }).fill("fake-secret");
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled({
    timeout: 15000,
  });
  await clickProviderContinue(page, /[?&]step=4(?:&|$)/);

  await clickWizardPrimary(page, "Continue", /[?&]step=5(?:&|$)/);
  await page.getByPlaceholder("One keyword per line").fill(keyword);
  await clickWizardPrimary(page, "Continue", /[?&]step=6(?:&|$)/);
  await clickWizardPrimary(page, "Open dashboard", /\/app\/overview$/);

  return { keyword };
}
