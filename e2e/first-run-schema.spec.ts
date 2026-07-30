import fs from "node:fs/promises";
import path from "node:path";
import { databaseConnectionConfig, databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { withPublicIdWrites } from "@/lib/db/public-id-writes";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";

const otpFile = process.env.BISIBILITY_E2E_OTP_FILE;
const databaseUrl = process.env.DATABASE_URL;

test.skip(
  process.env.BISIBILITY_FIRST_RUN_SCHEMA_E2E !== "1",
  "Run only against the dedicated empty non-public-schema production database.",
);

async function latestOtpFor(email: string) {
  if (!otpFile) {
    throw new Error("BISIBILITY_E2E_OTP_FILE is required.");
  }

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const values = JSON.parse(await fs.readFile(otpFile, "utf8")) as Record<string, string>;
      const otp = values[email.toLowerCase()];
      if (otp) {
        return otp;
      }
    } catch {
      // The server writes the capture file asynchronously after logging the OTP.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`OTP for ${email} was not captured.`);
}

function schemaPrisma() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  const schema = databaseSchemaFromUrl(databaseUrl);
  if (!schema || schema === "public") {
    throw new Error("First-run schema E2E requires a non-public database schema.");
  }
  return withPublicIdWrites(
    new PrismaClient({
      adapter: new PrismaPg(
        {
          connectionString: databaseUrl,
          ...databaseConnectionConfig(databaseUrl),
          max: 1,
        },
        { schema },
      ),
    }),
  );
}

test("first-run setup and signed-in adminless recovery", async ({ page }) => {
  test.setTimeout(120_000);
  const email = `e2e-first-run-${Date.now().toString(36)}@example.com`;

  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Welcome to Bisibility" })).toBeVisible();
  await page.getByLabel("Your name").fill("Schema Administrator");
  await page.getByLabel("Email address").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();

  const code = await latestOtpFor(email);
  const firstBox = page.getByRole("textbox", { name: "Code", exact: true });
  await firstBox.focus();
  await page.keyboard.type(code);
  await page.getByRole("button", { name: "Verify and create account" }).click();

  await expect(page.getByRole("heading", { name: "You're the administrator" })).toBeVisible();
  await page.getByRole("link", { name: "Open the admin panel" }).click();
  await expect(page).toHaveURL(/\/app\/admin$/);

  const prisma = schemaPrisma();
  try {
    await prisma.user.update({
      data: { isInstanceAdmin: false },
      where: { email },
    });
  } finally {
    await prisma.$disconnect();
  }

  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Finish administrator setup" })).toBeVisible();
  await expect(page.getByText("This instance does not have an administrator.")).toBeVisible();

  for (const name of ["Complete setup", "Sign out and switch account"]) {
    const height = await page
      .getByRole("button", { name, exact: true })
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(height).toBe(44);
  }
  await page.screenshot({
    fullPage: true,
    path: path.resolve("reports/e2e/signed-in-adminless-setup-card.png"),
  });

  await page.getByRole("button", { name: "Complete setup" }).click();
  await expect(page.getByRole("heading", { name: "You're the administrator" })).toBeVisible();
});
