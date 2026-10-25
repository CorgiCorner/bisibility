import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  propertyQuotaKey,
  readPropertyQuota,
  recordProperty429,
  startPropertyInspection,
} from "./property-quota";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  tx: {
    $executeRaw: vi.fn(),
    inspectionPropertyQuota: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { ...mocks.tx, $transaction: mocks.transaction } }));
const now = new Date("2026-10-24T12:00:00Z");
let state: {
  accountKey: string;
  pacificDate: string;
  used: number;
  last429Kind: string | null;
  last429At: Date | null;
  resetAt: Date | null;
  dailyStoppedUntil: Date | null;
};
beforeEach(() => {
  vi.resetAllMocks();
  state = {
    accountKey: "property",
    pacificDate: "2026-10-24",
    used: 1999,
    last429Kind: null,
    last429At: null,
    resetAt: null,
    dailyStoppedUntil: null,
  };
  let queue = Promise.resolve();
  mocks.transaction.mockImplementation((fn) => {
    const result = queue.then(() => fn(mocks.tx));
    queue = result.then(() => undefined);
    return result;
  });
  mocks.tx.inspectionPropertyQuota.findUnique.mockImplementation(async () => state);
  mocks.tx.inspectionPropertyQuota.upsert.mockImplementation(async () => state);
  mocks.tx.inspectionPropertyQuota.update.mockImplementation(async ({ data }) => {
    const used =
      typeof data.used === "object" ? state.used + data.used.increment : (data.used ?? state.used);
    state = { ...state, ...data, used };
    return state;
  });
});

describe("persistent shared property allowance", () => {
  it("normalizes property identity and distinguishes domain and prefix quotas", () => {
    expect(propertyQuotaKey(" sc-domain:EXAMPLE.COM/ ")).toBe(
      propertyQuotaKey("sc-domain:example.com"),
    );
    expect(propertyQuotaKey("https://EXAMPLE.com")).toBe(propertyQuotaKey("https://example.com/"));
    expect(propertyQuotaKey("sc-domain:example.com")).not.toBe(
      propertyQuotaKey("https://example.com/"),
    );
    expect(propertyQuotaKey("sc-domain:example.com")).toMatch(/^gsc:property:[a-f0-9]{16}$/);
  });
  it("admits only one of two interleaved projects at the property ceiling", async () => {
    const projects = [
      { apiKey: "first-grant", login: "sc-domain:example.com" },
      { apiKey: "second-grant", login: " sc-domain:EXAMPLE.COM/ " },
    ];
    const result = await Promise.allSettled(
      projects.map((credentials) =>
        startPropertyInspection(propertyQuotaKey(credentials.login), "fixed", now),
      ),
    );
    expect(
      mocks.tx.inspectionPropertyQuota.upsert.mock.calls.map(([args]) => args.where.accountKey),
    ).toEqual(projects.map(() => propertyQuotaKey("sc-domain:example.com")));

    expect(result.map((row) => row.status)).toEqual(["fulfilled", "rejected"]);
    expect(state.used).toBe(2000);
  });
  it("continues available quota past the estimate, but daily 429 stops every caller", async () => {
    await startPropertyInspection("property", "available_quota", now);
    await startPropertyInspection("property", "available_quota", now);
    expect(state.used).toBe(2001);
    await recordProperty429(
      "property",
      new ProviderRateLimitedError("gsc", { scope: "daily", source: "provider" }),
      now,
    );
    await expect(startPropertyInspection("property", "available_quota", now)).rejects.toMatchObject(
      { scope: "daily" },
    );
    expect(state.dailyStoppedUntil).toEqual(new Date("2026-10-25T07:00:00Z"));
    await startPropertyInspection("property", "fixed", new Date("2026-10-25T07:00:00Z"));
    expect(state.used).toBe(1);
  });
  it.each(["minute", "unknown"] as const)(
    "records %s evidence without asserting daily exhaustion",
    async (scope) => {
      await recordProperty429(
        "property",
        new ProviderRateLimitedError("gsc", {
          scope,
          source: "provider",
          resetAt: now.getTime() + 60000,
        }),
        now,
      );
      expect(state.last429Kind).toBe(scope);
      expect(state.dailyStoppedUntil).toBeNull();
      await startPropertyInspection("property", "fixed", now);
      expect(await readPropertyQuota("property", now)).toMatchObject({
        todayCount: 2000,
        last429Kind: scope,
      });
    },
  );
  it("does not record a local ceiling as a Google 429", async () => {
    await recordProperty429(
      "property",
      new ProviderRateLimitedError("gsc", { scope: "daily", source: "local" }),
      now,
    );
    expect(state.last429At).toBeNull();
  });
});
