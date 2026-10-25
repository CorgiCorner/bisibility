import "./sync.test-support";
import { beforeEach, expect, it, vi } from "vitest";
import { inspectionDay } from "./inspection-budget";
import { mocks } from "./sync.test-support";
import { configurePresenceDatabase } from "./sync-database.test-support";
import { syncPresenceForProject } from "./sync-project";

const started = new Date("2026-10-25T06:59:59Z");
const admissionAt = new Date("2026-10-25T07:00:01Z");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.project.findFirst.mockResolvedValue({ id: "project", defaults: {} });
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
  mocks.reserveInspections.mockImplementation(async ({ urls, now }) => ({
    admitted: urls,
    targetId: "prj_fixture",
    reservationAt: now ?? admissionAt,
    dayEnd: inspectionDay(now ?? admissionAt).lt,
    previous: [],
  }));
  mocks.provider.createUrlInspectionSession.mockResolvedValue({
    inspectUrl: mocks.provider.inspectUrl,
  });
  mocks.provider.inspectUrl.mockResolvedValue({ verdict: "PASS" });
});

it("reserves a later project using the actual admission day after Pacific midnight", async () => {
  const result = await syncPresenceForProject("project", started, mocks.provider, {
    clock: () => admissionAt.getTime(),
  });
  expect(result).toMatchObject({ checked: 1, failed: 0, deferred: 0, deferredReason: null });
  expect(mocks.provider.inspectUrl).toHaveBeenCalledOnce();
  expect(mocks.reserveInspections.mock.calls[0][0]).not.toHaveProperty("now");
  expect(mocks.releaseInspections).toHaveBeenCalledWith(
    expect.objectContaining({ reservationAt: admissionAt, released: 0 }),
  );
});
