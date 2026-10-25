import { makePublicId } from "@/lib/db/public-id";
import { maintainRetainedRankResults } from "@/lib/rank-check/recovery-maintenance";
import { afterEach, expect, it, vi } from "vitest";
import { lookupRecoveryEvidence } from "./lookup";
import { recoverySwitches } from "./switches";

vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: () => {
        throw new Error("Demo touched database");
      },
    },
  ),
}));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => "fixture" }));
vi.mock("@/lib/metering/recovery/tokens", () => ({ recoveryInstance: () => "fixture" }));
vi.mock("@/lib/rank-check/recovery-restore", () => ({
  restoreRetainedRankResult: () => {
    throw new Error("Demo restore");
  },
}));
vi.mock("@/lib/rank-check/recovery-evidence", () => ({
  RetainedRankResultUnreadableError: class {},
}));
vi.mock("@/lib/rank-check/recovery-result-health", () => ({ saveResultRecoveryHealth: vi.fn() }));
vi.mock("@/lib/provider-evidence/dataforseo/account", () => ({ originalRecoveryAccount: vi.fn() }));
afterEach(() => vi.unstubAllEnvs());
const off = {
  capture: false,
  lookup: false,
  proofWrites: false,
  restore: false,
  incidentBell: false,
  incidentDigest: false,
};
it.each([
  [undefined, off],
  ["off", off],
  ["observe", { ...off, capture: true, lookup: true }],
  [
    "on",
    {
      capture: true,
      lookup: true,
      proofWrites: true,
      restore: true,
      incidentBell: true,
      incidentDigest: true,
    },
  ],
] as const)("DV-5 mode %s maps the exact stage set", (mode, expected) => {
  expect(recoverySwitches({ PROVIDER_RECOVERY: mode })).toEqual(expected);
});
it("fails closed for invalid values and warns once with accepted modes", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  for (const mode of ["", "true", "1", "ON", " observe ", "invalid"])
    expect(recoverySwitches({ PROVIDER_RECOVERY: mode })).toEqual(off);
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    "Invalid PROVIDER_RECOVERY mode; accepted values: off, observe, on. Using off.",
  );
  warn.mockRestore();
});
it.each(["legacy-read-only", "editable"])(
  "DV-4 demo %s denies every stage and maintenance before any dependency",
  async (mode) => {
    vi.stubEnv("DEMO_MODE", mode === "editable" ? "editable" : "");
    vi.stubEnv("READ_ONLY_DEMO", mode === "legacy-read-only" ? "1" : "0");
    vi.stubEnv("DEMO_USER_ID", makePublicId("usr"));
    vi.stubEnv("DEMO_OWNER_ID", makePublicId("usr"));
    vi.stubEnv("DEMO_PROJECT_ID", makePublicId("prj"));
    vi.stubEnv("PROVIDER_RECOVERY", "on");
    expect(Object.values(recoverySwitches())).toEqual(Array(6).fill(false));
    const transport = vi.fn(() => {
      throw new Error("Demo constructed provider transport");
    });
    expect(
      await lookupRecoveryEvidence(null, null, new Date(), { transport, resolveAccount: vi.fn() }),
    ).toMatchObject({ kind: "inactive" });
    expect(transport).not.toHaveBeenCalled();
    expect(await maintainRetainedRankResults()).toEqual({ restored: 0 });
  },
);

it.each(["off", "observe"])("%s skips result maintenance before database access", async (mode) => {
  vi.stubEnv("PROVIDER_RECOVERY", mode);
  expect(await maintainRetainedRankResults()).toEqual({ restored: 0 });
});
