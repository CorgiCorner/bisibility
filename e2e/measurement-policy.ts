import { expect, type Page } from "./fixtures";

/** Explicit test-user configuration through the shipped UI, not read-time synthetic initialization. */
export async function configureSyntheticMeasurementPolicy(page: Page, projectRef: string) {
  if (process.env.BISIBILITY_FAKE_PROVIDER !== "1" || process.env.CORGICORNER_EPHEMERAL !== "1")
    throw new Error(
      "Explicit synthetic policy fixture requires the owned ephemeral fake-provider stack.",
    );
  if (!/^prj_[a-zA-Z0-9]+$/u.test(projectRef))
    throw new Error("Actual project public ID is required.");
  const returnUrl = page.url();
  await page.goto(`/app/${projectRef}/settings/tracking#measurement-policy`);
  const card = page.locator("#measurement-policy");
  await expect(
    card.getByText("Configure measurement policy before running new checks.", { exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: "Configure policy", exact: true }).click();
  await expect(card.getByText("Measurement policy is configured.", { exact: true })).toBeVisible();
  await page.goto(returnUrl);
}
