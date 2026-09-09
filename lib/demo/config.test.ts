import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDemoAccountMutable, readOnlyDemoConfig } from "./config";

const demo = {
  READ_ONLY_DEMO: "1",
  DEMO_USER_ID: "usr_abcdefghijklmnopqrstuvwx",
  DEMO_PROJECT_ID: "prj_abcdefghijklmnopqrstuvwx",
};

afterEach(() => vi.unstubAllEnvs());

describe("read-only demo configuration", () => {
  it("does not change ordinary deployments or the disposable fixed-code demo", () => {
    expect(readOnlyDemoConfig({ DEMO_FIXED_OTP: "1" })).toBeNull();
    expect(readOnlyDemoConfig({})).toBeNull();
  });

  it("requires an explicit viewer identity and project", () => {
    expect(readOnlyDemoConfig(demo)).toEqual({
      userPublicId: demo.DEMO_USER_ID,
      projectPublicId: demo.DEMO_PROJECT_ID,
    });
    expect(() => readOnlyDemoConfig({ READ_ONLY_DEMO: "1" })).toThrow();
    expect(() => readOnlyDemoConfig({ ...demo, DEMO_USER_ID: demo.DEMO_PROJECT_ID })).toThrow();
  });

  it("never combines public read-only access with global fixed OTP", () => {
    for (const key of ["DEMO_FIXED_OTP", "ALLOW_INSECURE_FIXED_OTP"]) {
      expect(() => readOnlyDemoConfig({ ...demo, [key]: "1" })).toThrow();
    }
  });

  it("blocks account mutation only on the explicitly configured demo", () => {
    vi.stubEnv("READ_ONLY_DEMO", "0");
    expect(() => assertDemoAccountMutable()).not.toThrow();
    for (const [key, value] of Object.entries(demo)) vi.stubEnv(key, value);
    expect(() => assertDemoAccountMutable()).toThrow("Account settings are locked in this demo.");
  });
});
