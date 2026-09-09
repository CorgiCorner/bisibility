import { expect, test } from "@playwright/test";
import { completeOnboarding, signIn } from "./workspace";

const key = process.env.E2E_POSTHOG_KEY;
const host = process.env.E2E_POSTHOG_HOST;

test.skip(!key, "E2E_POSTHOG_KEY is required for analytics provider verification.");

type CapturedEvent = {
  event: string;
  properties?: Record<string, unknown>;
  timestamp?: string;
};

async function resetCapturedEvents() {
  if (!host) throw new Error("E2E_POSTHOG_HOST is required for funnel verification.");
  const response = await fetch(`${host}/__events`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Analytics collector reset failed: ${response.status}`);
}

async function capturedEvents(): Promise<CapturedEvent[]> {
  if (!host) throw new Error("E2E_POSTHOG_HOST is required for funnel verification.");
  const response = await fetch(`${host}/__events`);
  if (!response.ok) throw new Error(`Analytics collector read failed: ${response.status}`);
  return response.json() as Promise<CapturedEvent[]>;
}

function orderedFunnel(events: CapturedEvent[], names: readonly string[]) {
  return events
    .filter(({ event }) => names.includes(event))
    .sort((left, right) =>
      String(left.timestamp ?? left.properties?.$time ?? "").localeCompare(
        String(right.timestamp ?? right.properties?.$time ?? ""),
      ),
    );
}

// posthog-js drops every capture from a browser it classifies as automation: it reads
// navigator.webdriver and the HeadlessChrome brand in navigator.userAgentData. Production keeps
// that filter, which is what we want. This spec verifies the path a real visitor takes, so the
// test browser has to present as one. Without this, "Accept all" still sets the cookie and loads the
// recorder while no request ever reaches /i/v0/e/, and the failure reads like a broken runtime.
// Verified against a Vercel preview on 2026-09-06: a real browser captures, this one did not.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const proto = Object.getPrototypeOf(navigator);
    Object.defineProperty(proto, "webdriver", { configurable: true, get: () => false });
    Object.defineProperty(proto, "userAgentData", { configurable: true, get: () => undefined });
  });
});

function isCaptureRequest(url: string) {
  return new URL(url).pathname.includes("/e/");
}

test("refusing optional analytics stores no provider cookie", async ({ context, page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Analytics consent")).toBeVisible();
  await page.getByRole("button", { name: "Reject all" }).click();
  await expect(page.getByLabel("Analytics consent")).toHaveCount(0);

  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name.startsWith("ph_"))).toBe(false);
});

test("allowing analytics stores a provider cookie and captures events", async ({
  context,
  page,
}) => {
  const captures: string[] = [];
  page.on("request", (request) => {
    if (isCaptureRequest(request.url())) captures.push(request.url());
  });

  await page.goto("/");
  const capturesBeforeConsent = captures.length;
  await page.getByRole("button", { name: "Accept all" }).click();

  // The cookie is the only honest post-consent signal. Cookieless mode already captures
  // pageviews before a choice is made, so polling the capture count alone is satisfied by
  // that pre-consent traffic and the assertion then runs before opt_in_capturing() has
  // written the cookie.
  await expect
    .poll(async () => (await context.cookies()).some((cookie) => cookie.name.startsWith("ph_")))
    .toBe(true);
  expect(captures.length).toBeGreaterThan(capturesBeforeConsent);
});

// Replay privacy and SPA lifecycle are verified with decoded local payloads by
// scripts/dev/replay-harness/run.mjs, including the production recorder and DataTable.
// Loading a recorder script is deliberately not used as a recording-safety assertion.

test("captures the signup-to-dashboard onboarding funnel in order", async ({ page }) => {
  await resetCapturedEvents();
  const suffix = `analytics-${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Accept all" }).click();
  await page.getByRole("textbox", { name: "Company website" }).fill(`${suffix}.example.com`);
  await page.getByRole("button", { name: "Track your website rankings" }).click();
  await expect(page).toHaveURL(/\/login\?/);
  await signIn(page, `e2e-${suffix}@example.com`, { navigate: false });
  await completeOnboarding(page, suffix, { runPreview: true });

  const names = [
    "user_signed_up",
    "onboarding_project_created",
    "provider_connection_tested",
    "provider_connected",
    "keywords_added",
    "rank_check_preview_completed",
    "onboarding_completed",
  ] as const;
  await expect
    .poll(async () => orderedFunnel(await capturedEvents(), names).length)
    .toBe(names.length);
  const events = orderedFunnel(await capturedEvents(), names);
  expect(events.map(({ event }) => event)).toEqual(names);
  expect(events.find(({ event }) => event === "provider_connected")?.properties).toMatchObject({
    provider: "dataforseo",
    surface: "onboarding",
  });
  expect(events.find(({ event }) => event === "keywords_added")?.properties).toMatchObject({
    source: "manual",
    surface: "onboarding",
  });
  expect(
    events.find(({ event }) => event === "rank_check_preview_completed")?.properties,
  ).toMatchObject({ provider: "dataforseo", status: "queued", surface: "onboarding" });
  expect(events.find(({ event }) => event === "onboarding_completed")?.properties).toMatchObject({
    first_check_ran: true,
    has_provider: true,
    keyword_count: 1,
  });
});

test("captures provider skip before provider-free onboarding completion", async ({ page }) => {
  await resetCapturedEvents();
  const suffix = `analytics-skip-${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Accept all" }).click();
  await signIn(page, `e2e-${suffix}@example.com`);
  await completeOnboarding(page, suffix, { skipProvider: true });

  const names = ["onboarding_step_skipped", "onboarding_completed"] as const;
  await expect.poll(async () => orderedFunnel(await capturedEvents(), names).length).toBe(2);
  const events = orderedFunnel(await capturedEvents(), names);
  expect(events.map(({ event }) => event)).toEqual(names);
  expect(events[0]?.properties).toMatchObject({ reason: null, step: "connect_source" });
  expect(events[1]?.properties).toMatchObject({
    first_check_ran: false,
    has_provider: false,
    keyword_count: 1,
  });
});
