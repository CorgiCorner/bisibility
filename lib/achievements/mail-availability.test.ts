import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ enabled: true, configured: vi.fn(), refresh: vi.fn() }));
vi.mock("./config", () => ({ achievementEmailsEnabled: () => m.enabled }));
vi.mock("@/lib/email/registry", () => ({ isEmailConfigured: m.configured }));
vi.mock("@/lib/email/instance-mail-store", () => ({ refreshInstanceMailRuntime: m.refresh }));

import { achievementMailAvailable } from "./mail-availability";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SITE_URL", "https://app.example.com");
  m.enabled = true;
  m.configured.mockReturnValue(true);
  m.refresh.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
it("offers mail only when the instance origin and refreshed transport are available", async () => {
  expect(await achievementMailAvailable()).toBe(true);
  expect(m.refresh).toHaveBeenCalledOnce();
  m.configured.mockReturnValue(false);
  expect(await achievementMailAvailable()).toBe(false);
});
it.each(["", "file:///tmp", "javascript:alert(1)"])(
  "disables mail without an application origin: %s",
  async (origin) => {
    vi.stubEnv("SITE_URL", origin);
    expect(await achievementMailAvailable()).toBe(false);
    expect(m.refresh).not.toHaveBeenCalled();
  },
);
it("does not offer disabled instance mail", async () => {
  m.enabled = false;
  expect(await achievementMailAvailable()).toBe(false);
  expect(m.refresh).not.toHaveBeenCalled();
});
it("keeps the activity page readable when mail configuration is invalid", async () => {
  m.configured.mockImplementation(() => {
    throw new Error("invalid provider");
  });
  expect(await achievementMailAvailable()).toBe(false);
});
