import { afterEach, beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ cloud: false }));
vi.mock("@/lib/deployment/deployment", () => ({
  get isCloud() {
    return m.cloud;
  },
}));
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: () => ({ kind: "disabled" }) }));

import { achievementEmailsEnabled, achievementsEnabled } from "./config";

beforeEach(() => {
  m.cloud = false;
  vi.stubEnv("ACHIEVEMENTS_ENABLED", "");
  vi.stubEnv("ACHIEVEMENTS_EMAIL_ENABLED", "");
});
afterEach(() => vi.unstubAllEnvs());
it("defaults off for OSS, on for Cloud, and keeps mail separate", () => {
  expect(achievementsEnabled()).toBe(false);
  expect(achievementEmailsEnabled()).toBe(false);
  vi.stubEnv("ACHIEVEMENTS_ENABLED", "true");
  expect(achievementsEnabled()).toBe(true);
  expect(achievementEmailsEnabled()).toBe(false);
  m.cloud = true;
  vi.stubEnv("ACHIEVEMENTS_ENABLED", "");
  expect(achievementsEnabled()).toBe(true);
  expect(achievementEmailsEnabled()).toBe(true);
  vi.stubEnv("ACHIEVEMENTS_EMAIL_ENABLED", "false");
  expect(achievementEmailsEnabled()).toBe(false);
});
