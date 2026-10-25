import "./sync.test-support";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import { beforeEach, expect, it, vi } from "vitest";
import { persistIndexingDay } from "./daily-summary";
import { syncPresenceForProject } from "./sync";
import { mocks } from "./sync.test-support";
import { configurePresenceDatabase } from "./sync-database.test-support";

const now = new Date("2026-10-24T12:00:00Z");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.providerConnection.findFirst.mockResolvedValue({
    id: "connection",
    credentialsEncrypted: "fixture",
  });
  mocks.decryptProviderCredentials.mockReturnValue({ login: "sc-domain:example.com" });
});
it("skips projects whose inspection limit is zero", async () => {
  mocks.prisma.project.findFirst.mockResolvedValue({
    defaults: { inspectionDailyLimit: 0 },
    id: "project_1",
  });

  await expect(syncPresenceForProject("project_1", now)).resolves.toEqual({
    projectId: "project_1",
    reason: "disabled",
    status: "skipped",
  });

  expect(mocks.provider.createUrlInspectionSession).not.toHaveBeenCalled();
  expect(mocks.provider.inspectUrl).not.toHaveBeenCalled();
});

it("disables background inspection in off mode without discovery or live provider calls", async () => {
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project_1",
    defaults: { inspectionDailyLimit: 50, inspectionBudgetMode: "off" },
  });
  expect(await syncPresenceForProject("project_1", now)).toMatchObject({
    status: "skipped",
    reason: "disabled",
  });
  expect(mocks.provider.createUrlInspectionSession).not.toHaveBeenCalled();
  expect(persistIndexingDay).toHaveBeenCalledWith({
    projectId: "project_1",
    property: "sc-domain:example.com",
    now,
    stop: "off",
  });
});
it("records the project allowance as quota rather than off", async () => {
  mocks.prisma.project.findFirst.mockResolvedValue({
    id: "project_1",
    defaults: { inspectionDailyLimit: 0, inspectionBudgetMode: "fixed" },
  });
  await syncPresenceForProject("project_1", now);
  expect(persistIndexingDay).toHaveBeenCalledWith(expect.objectContaining({ stop: "quota" }));
});

it.each(["daily", "minute", "unknown"] as const)(
  "maps a %s stop to the stored daily summary",
  async (scope) => {
    mocks.prisma.project.findFirst.mockResolvedValue({ id: "project_1", defaults: null });
    mocks.prisma.keyword.findMany.mockResolvedValue([{ targetUrl: "https://example.com/a" }]);
    mocks.prisma.urlPresence.findMany.mockResolvedValue([]);
    configurePresenceDatabase(mocks.prisma, mocks.tx);
    mocks.prisma.$transaction.mockImplementation((fn) => fn(mocks.tx));
    mocks.reserveInspections.mockResolvedValue({
      admitted: ["https://example.com/a"],
      targetId: "p",
    });
    mocks.provider.createUrlInspectionSession.mockResolvedValue({
      inspectUrl: mocks.provider.inspectUrl,
    });
    mocks.provider.inspectUrl.mockRejectedValue(
      new ProviderRateLimitedError("gsc", { scope, source: "provider" }),
    );
    await syncPresenceForProject("project_1", now, mocks.provider, {
      clock: () => now.getTime(),
      sleep: async () => undefined,
    });
    expect(persistIndexingDay).toHaveBeenCalledWith(
      expect.objectContaining({ stop: scope === "daily" ? "quota" : null }),
    );
  },
);
