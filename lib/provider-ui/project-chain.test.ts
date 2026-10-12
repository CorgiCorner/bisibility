import type { Prisma } from "@/lib/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProviderUiService } from "./service";
import type { ProviderUiState } from "./state";

const host = vi.hoisted(() => ({
  load: vi.fn(),
  audit: vi.fn(),
  retained: vi.fn(),
  retain: vi.fn(),
}));
vi.mock("./state", () => ({
  loadProviderUiState: host.load,
  connectionRevision: (_state: unknown, row: { publicId: string }) =>
    row.publicId.includes("first") ? "b".repeat(64) : "c".repeat(64),
}));
vi.mock("./read", () => ({ readProviderUi: vi.fn() }));
vi.mock("./journal", () => ({ retainedCommand: host.retained, retainCommand: host.retain }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: host.audit }));
vi.mock("./allocations", () => ({ allocationUpdates: vi.fn() }));
vi.mock("@/lib/provider-allocations/service", () => ({
  setProviderConnectionAllocationInTransaction: vi.fn(),
}));
vi.mock("@/lib/api/provider-rate-service", () => ({
  updateProviderConnectionRateInTransaction: vi.fn(),
}));

const first = "conn_firstabcdefghijklmnopqrs";
const second = "conn_secondabcdefghijklmnopqr";
const command = {
  kind: "project_chain",
  commandId: "chain-command-0001",
  expectedRevision: "a".repeat(64),
  entries: [
    { id: second, enabled: true, expectedRevision: "c".repeat(64) },
    { id: first, enabled: false, expectedRevision: "b".repeat(64) },
  ],
};
const scope = {
  actor: { id: "actor", role: "admin" as const, memberships: [] },
  projectPublicId: "prj_chain",
};
const update = vi.fn();
const tx = { providerConnection: { update } } as unknown as Prisma.TransactionClient;
const database = {
  $transaction: vi.fn(async (callback: (client: Prisma.TransactionClient) => Promise<unknown>) =>
    callback(tx),
  ),
};
const service = createProviderUiService(
  database as unknown as Parameters<typeof createProviderUiService>[0],
);
let state: ProviderUiState;
beforeEach(() => {
  vi.clearAllMocks();
  state = {
    actor: scope.actor,
    project: { id: "internal-project", publicId: scope.projectPublicId },
    binding: { canManage: true },
    revision: "a".repeat(64),
    connections: [
      {
        id: "internal-first",
        publicId: first,
        provider: "dataforseo",
        status: "connected",
        enabled: true,
        priority: 0,
      },
      {
        id: "internal-second",
        publicId: second,
        provider: "serpapi",
        status: "connected",
        enabled: true,
        priority: 1,
      },
      {
        id: "internal-analytics",
        publicId: "conn_analytics",
        provider: "gsc",
        status: "connected",
      },
    ],
  } as unknown as ProviderUiState;
  host.load.mockResolvedValue(state);
  host.retained.mockResolvedValue(null);
  host.retain.mockImplementation(async (_tx, _state, _command, result) => result);
  update.mockResolvedValue({});
  host.audit.mockResolvedValue(undefined);
});

describe("atomic project-chain command", () => {
  it("saves the complete SERP order and enabled states in one journalled transaction", async () => {
    expect(await service.execute(scope, command)).toMatchObject({
      outcome: "success",
      commandId: command.commandId,
    });
    expect(database.$transaction).toHaveBeenCalledOnce();
    expect(update.mock.calls.map(([args]) => args)).toEqual([
      { where: { id: "internal-second" }, data: { enabled: true, priority: 0 } },
      { where: { id: "internal-first" }, data: { enabled: false, priority: 100 } },
    ]);
    expect(host.audit).toHaveBeenCalledTimes(2);
    expect(host.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "provider.set_settings", targetId: first }),
      tx,
    );
    expect(host.retain).toHaveBeenCalledWith(
      tx,
      state,
      command,
      expect.objectContaining({ outcome: "success" }),
    );
  });

  it.each(["project", "row"])("fences a stale %s revision before any write", async (target) => {
    const stale = structuredClone(command);
    if (target === "project") stale.expectedRevision = "d".repeat(64);
    else stale.entries[1].expectedRevision = "d".repeat(64);
    expect(await service.execute(scope, stale)).toMatchObject({ outcome: "conflict" });
    expect(update).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "missing", "analytics"])(
    "rejects a %s connection set before any write",
    async (target) => {
      const invalid = structuredClone(command);
      if (target === "duplicate") invalid.entries[1] = invalid.entries[0];
      if (target === "missing") invalid.entries.pop();
      if (target === "analytics") invalid.entries[1].id = "conn_analyticsabcdefghijklmn";
      expect(await service.execute(scope, invalid)).toMatchObject({ outcome: "invalid" });
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("reports a disconnected stale draft as a revision conflict", async () => {
    state.connections[0].status = "needs_reauth";
    state.revision = "d".repeat(64);
    expect(await service.execute(scope, command)).toMatchObject({
      outcome: "conflict",
      reason: "revision_changed",
      currentRevision: state.revision,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses viewer and read-only grants without writing", async () => {
    state.binding.canManage = false;
    expect(await service.execute(scope, command)).toMatchObject({ outcome: "forbidden" });
    expect(update).not.toHaveBeenCalled();
  });

  it("does not acknowledge or journal a partially failed transaction", async () => {
    update.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("synthetic write failure"));
    expect(await service.execute(scope, command)).toMatchObject({
      outcome: "unavailable",
      ambiguous: true,
    });
    expect(update).toHaveBeenCalledTimes(2);
    expect(host.retain).not.toHaveBeenCalled();
  });

  it("reconciles the original command without another mutation", async () => {
    host.retained.mockResolvedValue({
      outcome: "success",
      commandId: command.commandId,
      revision: "new",
    });
    expect(await service.reconcile(scope, command)).toMatchObject({ outcome: "success" });
    expect(host.retained).toHaveBeenCalledWith(tx, state, command);
    expect(update).not.toHaveBeenCalled();
    expect(host.retain).not.toHaveBeenCalled();
  });

  it("returns a retained result on replay without another mutation", async () => {
    host.retained.mockResolvedValue({
      outcome: "success",
      commandId: command.commandId,
      revision: "new",
    });
    expect(await service.execute(scope, command)).toMatchObject({ outcome: "success" });
    expect(update).not.toHaveBeenCalled();
  });
});
