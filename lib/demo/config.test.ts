import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDemoAccountMutable, readDemoConfig, readOnlyDemoConfig } from "./config";

const demo = {
  READ_ONLY_DEMO: "1",
  DEMO_USER_ID: "usr_abcdefghijklmnopqrstuvwx",
  DEMO_PROJECT_ID: "prj_abcdefghijklmnopqrstuvwx",
};

const editableDemo = {
  DEMO_MODE: "editable",
  DEMO_OWNER_ID: "usr_zyxwvutsrqponmlkjihgfedc",
  DEMO_PROJECT_ID: demo.DEMO_PROJECT_ID,
  DEMO_USER_ID: demo.DEMO_USER_ID,
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

  it("parses the disabled, legacy, and editable modes as a discriminated configuration", () => {
    expect(readDemoConfig({})).toEqual({ kind: "disabled" });
    expect(readDemoConfig(demo)).toEqual({
      kind: "legacy-read-only",
      projectPublicId: demo.DEMO_PROJECT_ID,
      viewerPublicId: demo.DEMO_USER_ID,
    });
    expect(readDemoConfig(editableDemo)).toEqual({
      kind: "editable",
      ownerPublicId: editableDemo.DEMO_OWNER_ID,
      projectPublicId: editableDemo.DEMO_PROJECT_ID,
      viewerPublicId: editableDemo.DEMO_USER_ID,
    });
    expect(readOnlyDemoConfig(editableDemo)).toBeNull();
  });

  it("fails closed for mixed, unknown, malformed, equal, and fixed-code editable settings", () => {
    expect(() => readDemoConfig({ ...demo, DEMO_MODE: "editable" })).toThrow();
    expect(() => readDemoConfig({ DEMO_MODE: "other" })).toThrow();
    expect(() => readDemoConfig({ ...editableDemo, DEMO_OWNER_ID: "invalid" })).toThrow();
    expect(() => readDemoConfig({ ...editableDemo, DEMO_OWNER_ID: demo.DEMO_USER_ID })).toThrow();
    for (const key of ["DEMO_FIXED_OTP", "ALLOW_INSECURE_FIXED_OTP"]) {
      expect(() => readDemoConfig({ ...editableDemo, [key]: "1" })).toThrow();
    }
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
    vi.unstubAllEnvs();
    for (const [key, value] of Object.entries(editableDemo)) vi.stubEnv(key, value);
    expect(() => assertDemoAccountMutable()).toThrow("Account settings are locked in this demo.");
  });
});
