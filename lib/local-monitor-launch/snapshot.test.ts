import { beforeEach, expect, it, vi } from "vitest";
import { currentMonitorLaunchSnapshot } from "./snapshot";

const f = vi.hoisted(() => ({ locked: vi.fn(), snapshot: vi.fn(), sources: vi.fn() }));
vi.mock("@/lib/local-monitor-store/storage", () => ({ lockedMonitor: f.locked }));
vi.mock("@/lib/local-monitor-store/snapshot", () => ({ loadMonitorSnapshot: f.snapshot }));
vi.mock("@/lib/local-monitor-store/references", () => ({ assertMonitorSourcesCurrent: f.sources }));
beforeEach(() => {
  vi.clearAllMocks();
  f.snapshot.mockResolvedValue({ definition: { grid: { size: 1 } } });
});
it("keeps unchanged Local consent through usage telemetry but invalidates configuration", async () => {
  const connection = {
    id: "connection",
    projectId: "project",
    provider: "dataforseo",
    kind: "serp",
    status: "connected",
    credentialSource: "own",
    enabled: true,
    updatedAt: new Date("2026-10-14T00:00:00Z"),
    providerUiRevision: 4n,
    credentialsEncrypted: "encrypted-fixture",
  };
  const tx = {
    $queryRaw: vi.fn(),
    providerConnection: {
      findFirst: vi.fn(async (_query: { select: Record<string, boolean> }) => connection),
    },
  };
  const scope = { project: { id: "project" } };
  const command = { monitorId: "monitor", expectedVersion: 1, connectionId: "connection" };
  const read = () => currentMonitorLaunchSnapshot(tx as never, scope as never, command as never);
  const initial = await read();
  connection.updatedAt = new Date("2026-10-15T00:00:00Z");
  expect((await read()).connectionStamp).toBe(initial.connectionStamp);
  connection.providerUiRevision++;
  expect((await read()).connectionStamp).not.toBe(initial.connectionStamp);
  expect(tx.providerConnection.findFirst.mock.calls[0][0].select.providerUiRevision).toBe(true);
});
