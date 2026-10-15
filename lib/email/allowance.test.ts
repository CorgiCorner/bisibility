import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getInstanceAdminEmailAllowance } from "./allowance";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  findMany: vi.fn(),
  isConfigured: vi.fn(),
  sender: vi.fn(),
  readStatus: vi.fn(),
  refresh: vi.fn(),
  demo: vi.fn(),
  mode: vi.fn(),
}));
vi.mock("@/lib/auth/instance-admin", () => ({ requireInstanceAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { emailDailyStat: { findMany: mocks.findMany } } }));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.mode }));
vi.mock("@/lib/demo/config", () => ({ readOnlyDemoConfig: mocks.demo }));
vi.mock("./registry", () => ({ isEmailConfigured: mocks.isConfigured }));
vi.mock("./from", () => ({ configuredEmailFrom: mocks.sender }));
vi.mock("./instance-mail-store", () => ({
  readInstanceMailStatus: mocks.readStatus,
  refreshInstanceMailRuntime: mocks.refresh,
}));

const now = new Date("2026-10-14T23:59:59.000Z");
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("EMAIL_PROVIDER", "smtp");
  vi.stubEnv("EMAIL_DAILY_BUDGET_BULK", "20");
  vi.stubEnv("EMAIL_DAILY_BUDGET_TRANSACTIONAL", "7");
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin" } });
  mocks.mode.mockReturnValue("self-host");
  mocks.demo.mockReturnValue(null);
  mocks.sender.mockReturnValue("operator@example.com");
  mocks.isConfigured.mockReturnValue(true);
  mocks.findMany.mockResolvedValue([{ category: "bulk", count: 4 }]);
});

afterEach(() => vi.unstubAllEnvs());

describe("installation email allowance", () => {
  it("reads configured local reservation attempts without reserving or sending", async () => {
    const result = await getInstanceAdminEmailAllowance(now);
    expect(result).toMatchObject({
      status: "available",
      scope: "installation",
      asOf: now.toISOString(),
      day: "2026-10-14T00:00:00.000Z",
      resetsAt: "2026-10-15T00:00:00.000Z",
      categories: [
        { category: "bulk", limit: 20, reservedAttempts: 4, remaining: 16 },
        { category: "transactional", limit: 7, reservedAttempts: 0, remaining: 7 },
      ],
    });
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: {
        day: new Date("2026-10-14T00:00:00.000Z"),
        category: { in: ["bulk", "transactional"] },
      },
      select: { category: true, count: true },
    });
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findMany.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.readStatus).not.toHaveBeenCalled();
  });

  it("repeated reads leave the retained counters unchanged", async () => {
    const first = await getInstanceAdminEmailAllowance(now);
    const refreshed = await getInstanceAdminEmailAllowance(now);
    expect(refreshed).toEqual(first);
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
  });

  it("skips counters when the selected transport is not configured", async () => {
    mocks.isConfigured.mockReturnValue(false);
    expect(await getInstanceAdminEmailAllowance(now)).toMatchObject({
      status: "not_configured",
      categories: [],
    });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("checks administrator access before any capability or usage read", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(getInstanceAdminEmailAllowance(now)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.isConfigured).not.toHaveBeenCalled();
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.readStatus).not.toHaveBeenCalled();
  });

  it("does not expose default allowances for an installation without a provider", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    mocks.readStatus.mockResolvedValue({
      credentialsConfigured: false,
      provider: null,
      sender: "",
    });
    expect(await getInstanceAdminEmailAllowance(now)).toMatchObject({
      status: "not_configured",
      categories: [],
    });
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("reads only the self-host's stored mail configuration", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    mocks.readStatus.mockResolvedValue({
      credentialsConfigured: true,
      provider: "smtp",
      sender: "operator@example.com",
    });
    expect(await getInstanceAdminEmailAllowance(now)).toMatchObject({
      status: "available",
      scope: "installation",
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.findMany).toHaveBeenCalledOnce();
  });

  it("keeps Cloud's own environment allowance independent of stored self-host configuration", async () => {
    mocks.mode.mockReturnValue("cloud");
    expect(await getInstanceAdminEmailAllowance(now)).toMatchObject({
      status: "available",
      categories: [{ limit: 20 }, { limit: 7 }],
    });
    expect(mocks.readStatus).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("does not reuse a stale stored runtime when Cloud has no configured provider", async () => {
    mocks.mode.mockReturnValue("cloud");
    vi.stubEnv("EMAIL_PROVIDER", "");
    expect(await getInstanceAdminEmailAllowance(now)).toMatchObject({
      status: "not_configured",
      categories: [],
    });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("skips allowances for disabled demo mail or incomplete sender configuration", async () => {
    mocks.demo.mockReturnValue({});
    expect(await getInstanceAdminEmailAllowance(now)).toMatchObject({
      status: "disabled",
      categories: [],
    });
    mocks.demo.mockReturnValue(null);
    mocks.sender.mockReturnValue(null);
    expect(await getInstanceAdminEmailAllowance(now)).toMatchObject({
      status: "not_configured",
      categories: [],
    });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("keeps store failure unknown instead of inventing zero usage", async () => {
    mocks.findMany.mockRejectedValue(new Error("Store unavailable"));
    expect(await getInstanceAdminEmailAllowance(now)).toMatchObject({
      status: "unavailable",
      categories: [
        { limit: 20, reservedAttempts: null, remaining: null },
        { limit: 7, reservedAttempts: null, remaining: null },
      ],
    });
  });

  it("distinguishes unreadable stored capability from unconfigured mail", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    mocks.readStatus.mockRejectedValue(new Error("Store unavailable"));
    expect(await getInstanceAdminEmailAllowance(now)).toMatchObject({
      status: "unavailable",
      categories: [],
    });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("does not expose a counter when retained credentials cannot be resolved", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    mocks.readStatus.mockResolvedValue({
      credentialsConfigured: true,
      provider: "smtp",
      sender: "operator@example.com",
    });
    mocks.isConfigured.mockReturnValue(false);
    expect(await getInstanceAdminEmailAllowance(now)).toMatchObject({
      status: "unavailable",
      categories: [],
    });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("keeps a lowered cap honest and resets the query at the next UTC day", async () => {
    mocks.findMany.mockResolvedValue([{ category: "bulk", count: 25 }]);
    const result = await getInstanceAdminEmailAllowance(new Date("2026-10-15T00:00:00.000Z"));
    expect(result).toMatchObject({
      day: "2026-10-15T00:00:00.000Z",
      categories: [
        { reservedAttempts: 25, remaining: 0 },
        { reservedAttempts: 0, remaining: 7 },
      ],
    });
  });

  it.each([-1, Number.NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects corrupt counts as unknown: %s",
    async (count) => {
      mocks.findMany.mockResolvedValue([{ category: "bulk", count }]);
      expect(await getInstanceAdminEmailAllowance(now)).toMatchObject({
        status: "unavailable",
        categories: [
          { reservedAttempts: null, remaining: null },
          { reservedAttempts: null, remaining: null },
        ],
      });
    },
  );
});
