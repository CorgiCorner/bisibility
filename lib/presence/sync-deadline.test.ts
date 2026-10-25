import "./sync.test-support";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startPropertyInspection } from "./property-quota";
import { syncPresenceForAllProjects, syncPresenceForProject } from "./sync";
import { mocks } from "./sync.test-support";
import { configurePresenceDatabase } from "./sync-database.test-support";

const now = new Date("2026-10-24T12:00:00Z");
afterEach(() => vi.useRealTimers());
beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.project.findMany.mockResolvedValue([{ id: "first" }, { id: "second" }]);
  mocks.prisma.project.findFirst.mockImplementation(({ where }) => ({
    id: where.OR[0].id,
    defaults: { inspectionBudgetMode: where.OR[0].id === "first" ? "fixed" : "available_quota" },
  }));
  mocks.prisma.providerConnection.findFirst.mockResolvedValue({
    id: "connection",
    credentialsEncrypted: "fixture",
  });
  mocks.decryptProviderCredentials.mockReturnValue({
    login: "sc-domain:example.com",
    apiKey: "fixture",
  });
  mocks.prisma.keyword.findMany.mockResolvedValue([{ targetUrl: "https://example.com/page" }]);
  mocks.prisma.urlPresence.findMany.mockResolvedValue([]);
  configurePresenceDatabase(mocks.prisma, mocks.tx);
  mocks.prisma.$transaction.mockImplementation((fn) => fn(mocks.tx));
  mocks.reserveInspections.mockImplementation(async ({ urls }) => ({
    admitted: urls,
    targetId: "project",
  }));
  mocks.provider.createUrlInspectionSession.mockResolvedValue({
    inspectUrl: mocks.provider.inspectUrl,
  });
  mocks.provider.inspectUrl.mockResolvedValue({ verdict: "PASS" });
});
vi.mock("@/lib/deployment/deployment", () => ({ isSelfHost: true }));

it("shares one deadline and defers a later project without starting it", async () => {
  let time = now.getTime();
  mocks.provider.inspectUrl.mockImplementation(async () => {
    time += 20 * 60 * 1000;
    return { verdict: "PASS" };
  });
  expect(await syncPresenceForAllProjects(now, { clock: () => time })).toMatchObject({
    checked: 1,
    deferredProjects: 1,
  });
  expect(mocks.prisma.project.findFirst).toHaveBeenCalledTimes(1);
  expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
  expect(mocks.prisma.project.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      orderBy: [
        { defaults: { indexingDiscoveryAt: { sort: "asc", nulls: "first" } } },
        { id: "asc" },
      ],
    }),
  );
});
it("does not fence an available quota project after a fixed project hits the local cap", async () => {
  vi.mocked(startPropertyInspection).mockRejectedValueOnce(
    new ProviderRateLimitedError("gsc", { scope: "daily", source: "local" }),
  );
  expect(await syncPresenceForAllProjects(now)).toMatchObject({
    checked: 1,
    deferred: 1,
    deferredProjects: 0,
  });
  expect(startPropertyInspection).toHaveBeenNthCalledWith(1, expect.any(String), "fixed");
  expect(startPropertyInspection).toHaveBeenNthCalledWith(2, expect.any(String), "available_quota");
  expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
});

it("defers an in-flight inspection at the deadline while retaining the sent allowance", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  let release = () => {};
  mocks.provider.inspectUrl.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ verdict: "PASS" });
      }),
  );
  const result = syncPresenceForProject("first", now, mocks.provider, {
    runDeadline: Date.now() + 100,
  });
  await vi.advanceTimersByTimeAsync(100);
  expect(await result).toMatchObject({
    checked: 0,
    failed: 0,
    deferred: 1,
    deferredReason: "run_deadline",
  });
  expect(mocks.provider.inspectUrl).toHaveBeenCalledTimes(1);
  expect(mocks.provider.inspectUrl.mock.calls[0][0].signal.aborted).toBe(true);
  expect(mocks.releaseInspections).toHaveBeenCalledWith(expect.objectContaining({ released: 0 }));
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.prisma.urlPresence.upsert).not.toHaveBeenCalled();
});

it("never dispatches after an expired quota wait and releases its unsent allowance", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  let release = () => {};
  vi.mocked(startPropertyInspection).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve();
      }),
  );
  const result = syncPresenceForProject("first", now, mocks.provider, {
    runDeadline: Date.now() + 100,
  });
  await vi.advanceTimersByTimeAsync(100);
  expect(await result).toMatchObject({
    checked: 0,
    failed: 0,
    deferred: 1,
    deferredReason: "run_deadline",
  });
  expect(mocks.releaseInspections).toHaveBeenCalledWith(expect.objectContaining({ released: 1 }));
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.provider.inspectUrl).not.toHaveBeenCalled();
});
