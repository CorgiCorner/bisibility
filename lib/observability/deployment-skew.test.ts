import { describe, expect, it, vi } from "vitest";
import { hasDeploymentSkew, recoverDeploymentSkew } from "./deployment-skew";

describe("deployment skew", () => {
  it("detects distinct ids across the error stack and scripts", () => {
    expect(
      hasDeploymentSkew(
        "at x (https://site/_next/a.js?dpl=dpl_new:1:2)",
        ["https://site/_next/b.js?dpl=dpl_old"],
        undefined,
      ),
    ).toBe(true);
    expect(hasDeploymentSkew("at x (?dpl=dpl_new) at y (?dpl=dpl_old)", [], undefined)).toBe(true);
  });
  it("compares loaded scripts to the running build when available", () => {
    expect(hasDeploymentSkew(undefined, ["https://site/a.js?dpl=dpl_old"], "dpl_new")).toBe(true);
    expect(hasDeploymentSkew(undefined, ["https://site/a.js?dpl=dpl_new"], "dpl_new")).toBe(false);
    expect(hasDeploymentSkew(undefined, [], "dpl_new")).toBe(false);
    expect(hasDeploymentSkew("at x (/a.js)", ["https://site/a.js"], undefined)).toBe(false);
  });
  it("allows one reload per target within the TTL, and retries after expiry", () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    };
    const reload = vi.fn();
    const args = {
      stack: "?dpl=one ?dpl=two",
      scriptUrls: [],
      deploymentId: undefined,
      storage,
      reload,
    };
    expect(recoverDeploymentSkew({ ...args, url: "https://site/a", now: 1000 })).toBe(true);
    expect(recoverDeploymentSkew({ ...args, url: "https://site/a", now: 1001 })).toBe(false);
    expect(recoverDeploymentSkew({ ...args, url: "https://site/b", now: 1001 })).toBe(true);
    expect(recoverDeploymentSkew({ ...args, url: "https://site/a", now: 62001 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(3);
  });
  it("never reloads without skew or when storage throws", () => {
    const reload = vi.fn();
    const storage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: vi.fn(),
    };
    expect(
      recoverDeploymentSkew({
        stack: "",
        scriptUrls: [],
        deploymentId: undefined,
        storage,
        reload,
        url: "/a",
        now: 1,
      }),
    ).toBe(false);
    expect(
      recoverDeploymentSkew({
        stack: "?dpl=one ?dpl=two",
        scriptUrls: [],
        deploymentId: undefined,
        storage,
        reload,
        url: "/a",
        now: 1,
      }),
    ).toBe(false);
    const writeDenied = {
      getItem: () => null,
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(
      recoverDeploymentSkew({
        stack: "?dpl=one ?dpl=two",
        scriptUrls: [],
        storage: writeDenied,
        reload,
        url: "/a",
        now: 1,
      }),
    ).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
