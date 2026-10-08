import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), init: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { instanceSetting: { findUnique: mocks.findUnique } },
}));
vi.mock("./runtime", () => ({
  meteringRuntime: mocks.init,
  meteringNamespace: () => "default",
  meteringSchema: () => "public",
}));

import { shadowForProject } from "./shadow-runtime";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("off is the default and makes no database query", async () => {
  vi.stubEnv("METERING_SHADOW", "off");
  expect(await shadowForProject("p1")).toBeNull();
  expect(mocks.findUnique).not.toHaveBeenCalled();
});
it("requires a database project opt-in even when enabled globally", async () => {
  vi.stubEnv("METERING_SHADOW", "on");
  mocks.findUnique.mockResolvedValue(null);
  expect(await shadowForProject("p1")).toBeNull();
  expect(mocks.init).not.toHaveBeenCalled();
});
it("a database failure never escapes the paid request", async () => {
  vi.stubEnv("METERING_SHADOW", "on");
  mocks.findUnique.mockRejectedValue(new Error("db unavailable"));
  const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  expect(await shadowForProject("p1")).toBeNull();
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});

it("reads the project flag once for one paid request, including its journal subrequests", async () => {
  vi.stubEnv("METERING_SHADOW", "on");
  mocks.findUnique.mockResolvedValue(null);
  const { withShadowRequest } = await import("./shadow-context");
  await withShadowRequest(async () => {
    await Promise.all([shadowForProject("p1"), shadowForProject("p1")]);
    await shadowForProject("p1");
  });
  expect(mocks.findUnique).toHaveBeenCalledTimes(1);
  await withShadowRequest(() => shadowForProject("p1"));
  expect(mocks.findUnique).toHaveBeenCalledTimes(2);
});
