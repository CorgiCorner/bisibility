import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extend: vi.fn((_fixtures: unknown) => ({ mode: "attached" })),
  attach: vi.fn(),
}));
vi.mock("@playwright/test", () => ({ expect: {}, test: { extend: mocks.extend } }));
vi.mock("./attached-opera-playwright.mjs", () => ({ attachOperaForTests: mocks.attach }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

async function localFixture() {
  vi.stubEnv("CI", "false");
  await import("../../e2e/fixtures");
  const fixtures = mocks.extend.mock.calls[0][0] as unknown as {
    browser: [
      (
        dependencies: { browserName: string },
        use: (browser: unknown) => Promise<void>,
      ) => Promise<void>,
    ];
  };
  return fixtures.browser[0];
}

it("rejects a non-Chromium project before attachment", async () => {
  const fixture = await localFixture();
  const use = vi.fn();
  await expect(fixture({ browserName: "firefox" }, use)).rejects.toThrow("require Chromium");
  expect(mocks.attach).not.toHaveBeenCalled();
  expect(use).not.toHaveBeenCalled();
});

it("uses and disposes the attached browser for Chromium", async () => {
  const fixture = await localFixture();
  const attachment = { browser: {}, dispose: vi.fn() };
  mocks.attach.mockResolvedValue(attachment);
  const use = vi.fn();
  await fixture({ browserName: "chromium" }, use);
  expect(use).toHaveBeenCalledExactlyOnceWith(attachment.browser);
  expect(attachment.dispose).toHaveBeenCalledOnce();
});

it("retains the unextended native test in CI", async () => {
  vi.stubEnv("CI", "true");
  const { test } = await import("../../e2e/fixtures");
  expect(test).toEqual({ extend: mocks.extend });
  expect(mocks.extend).not.toHaveBeenCalled();
  expect(mocks.attach).not.toHaveBeenCalled();
});
