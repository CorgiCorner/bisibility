import { describe, expect, it, vi } from "vitest";
import { enforceMigrationsAtStartup, shouldEnforceMigrationsAtStartup } from "./startup";

describe("blocking migration startup guard", () => {
  it("enforces migration readiness for the Node server runtime", async () => {
    const assertReady = vi.fn().mockResolvedValue(undefined);

    await enforceMigrationsAtStartup({ NEXT_RUNTIME: "nodejs" }, assertReady);

    expect(assertReady).toHaveBeenCalledOnce();
  });

  it("does not connect to the database during a production build", async () => {
    const assertReady = vi.fn();
    const env = { NEXT_PHASE: "phase-production-build", NEXT_RUNTIME: "nodejs" };

    expect(shouldEnforceMigrationsAtStartup(env)).toBe(false);
    await enforceMigrationsAtStartup(env, assertReady);

    expect(assertReady).not.toHaveBeenCalled();
  });

  it("does not run the Node database guard in the edge runtime", async () => {
    const assertReady = vi.fn();

    await enforceMigrationsAtStartup({ NEXT_RUNTIME: "edge" }, assertReady);

    expect(assertReady).not.toHaveBeenCalled();
  });
});
