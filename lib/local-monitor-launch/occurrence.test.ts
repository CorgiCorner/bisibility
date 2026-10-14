import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  snapshot: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $queryRaw: f.query, $executeRaw: f.execute },
}));
vi.mock("./snapshot", () => ({ currentMonitorLaunchSnapshot: f.snapshot }));

import { prisma } from "@/lib/db/prisma";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import { signMonitorConsent } from "./consent";
import { occurrenceBody } from "./identity";
import { command, now } from "./launch.test-fixture";
import { assertOccurrenceReplay, monitorOccurrenceBinding } from "./occurrence";

const row = {
  id: "occurrence",
  monitorId: "db-monitor",
  monitorPublicId: command.monitorId,
  actorId: "actor",
  bodyHash: occurrenceBody(command, "actor"),
  runId: "db-run",
  runPublicId: "run",
};
const scope: LocalProjectScope = {
  actor: { id: "actor", memberships: [] },
  project: {
    id: "db-project",
    publicId: command.projectId,
    writeMode: "active",
  },
  grant: { actorId: "actor", projectId: "db-project", role: "member" },
  context: { actor: null },
};
beforeEach(() => {
  vi.resetAllMocks();
  process.env.BISIBILITY_SECRETS_KEY = Buffer.alloc(32, 9).toString("base64");
  f.snapshot.mockResolvedValue({
    monitor: { id: "db-monitor" },
    revision: { id: command.revisionId },
    intent: { id: command.scheduleIntentId },
    connectionStamp: "stamp",
  });
});
afterEach(() => {
  delete process.env.BISIBILITY_SECRETS_KEY;
});
function signed() {
  const binding = {
    actorId: "actor",
    projectId: "db-project",
    monitorId: command.monitorId,
    monitorVersion: command.expectedVersion,
    revisionId: command.revisionId,
    scheduleIntentId: command.scheduleIntentId,
    connectionId: command.connectionId,
    connectionStamp: "stamp",
    targetIds: command.targetIds,
    idempotencyKey: command.idempotencyKey,
    quote: command.quote,
  };
  return { ...command, consentToken: signMonitorConsent(binding, now).token };
}
describe("retained monitor occurrence authority", () => {
  it("replays only the original actor and body, never a tombstoned or foreign actor", () => {
    expect(assertOccurrenceReplay(row, command, "actor")).toBe("run");
    expect(() => assertOccurrenceReplay(row, command, "other")).toThrow();
    expect(() => assertOccurrenceReplay({ ...row, actorId: null }, command, "actor")).toThrow();
    expect(() => assertOccurrenceReplay(row, { ...command, targetIds: [] }, "actor")).toThrow();
  });
  it("uses the caller's same transaction for current proof and occurrence insertion", async () => {
    const binding = monitorOccurrenceBinding(signed(), () => now);
    await binding.created(prisma, scope, {
      id: "db-run",
      publicId: "run",
      projectId: "db-project",
    });
    expect(f.snapshot).toHaveBeenCalledExactlyOnceWith(prisma, scope, expect.any(Object));
    expect(f.execute).toHaveBeenCalledTimes(1);
    const [, ...values] = f.execute.mock.calls[0];
    expect(values).toContain("db-run");
    expect(values).toContain("db-project");
    expect(values).toContain("db-monitor");
  });
  it("refuses expired/current-source or foreign run bindings before insertion", async () => {
    await expect(
      monitorOccurrenceBinding(signed(), () => new Date(command.quote.expiresAt)).created(
        prisma,
        scope,
        {
          id: "db-run",
          publicId: "run",
          projectId: "db-project",
        },
      ),
    ).rejects.toThrow("expired");
    await expect(
      monitorOccurrenceBinding(signed(), () => now).created(prisma, scope, {
        id: "db-run",
        publicId: "run",
        projectId: "other",
      }),
    ).rejects.toThrow();
    f.snapshot.mockRejectedValue(new Error("definition changed"));
    await expect(
      monitorOccurrenceBinding(signed(), () => now).verify(prisma, scope),
    ).rejects.toThrow("definition changed");
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("checks a retained run against its occurrence without attempting adoption or writes", async () => {
    f.query.mockResolvedValue([row]);
    await monitorOccurrenceBinding(command, () => new Date("2099-01-01")).replay(prisma, scope, {
      id: "db-run",
      publicId: "run",
      projectId: "db-project",
    });
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.snapshot).not.toHaveBeenCalled();
    await expect(
      monitorOccurrenceBinding(command, () => now).replay(prisma, scope, {
        id: "other",
        publicId: "run",
        projectId: "db-project",
      }),
    ).rejects.toThrow();
  });
});
