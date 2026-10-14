import { operationKey } from "@/lib/local-monitoring/target-key";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import { createReportCursorCodec } from "@/lib/rank-reports/cursor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { localResultFixture, resultObservation } from "./fixture";
import { readMonitorPointHistory } from "./point-history";

const mocked = vi.hoisted(() => ({
  scope: vi.fn(),
  entity: vi.fn(),
  binding: vi.fn(),
  policy: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/local-monitoring-store/access", () => ({ localProjectScope: mocked.scope }));
vi.mock("@/lib/business-location-store/access", () => ({
  businessReadProjectScope: mocked.entity,
}));
vi.mock("./binding", () => ({ readLocalResultBinding: mocked.binding }));
vi.mock("@/lib/measurement-definitions/host-policy-snapshot", () => ({
  readHostPolicySnapshot: mocked.policy,
}));
describe("point history uses the same original target and quality resolver", () => {
  beforeEach(() => vi.clearAllMocks());
  function fixture() {
    const f = localResultFixture(),
      row = f.binding.rows[0],
      saved = resultObservation(row);
    const tx = {
      localMonitorOccurrence: {
        count: vi.fn(async () => 1),
        findMany: vi.fn(async () => [{ runId: row.item.runId }]),
      },
      localMeasurementRunItem: { findMany: vi.fn(async () => [row.item]) },
      localMeasurementRun: {
        findMany: vi.fn(async () => [{ id: row.item.runId, publicId: f.binding.run.publicId }]),
      },
      observationRun: { findMany: vi.fn(async () => [saved.observation]) },
      businessMatchDecision: { findMany: vi.fn(async () => saved.decisions) },
    };
    mocked.scope.mockResolvedValue({ project: { id: row.item.projectId } });
    mocked.entity.mockResolvedValue({});
    mocked.binding.mockResolvedValue(f.binding);
    mocked.policy.mockResolvedValue({ state: "unconfigured", policyEpoch: "1", config: null });
    const db = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as LocalDatabase;
    const command = {
      projectId: "prj_abcdefghijklmnopqrstuvwx",
      monitorId: "lmn_abcdefghijklmnopqrstuvwx",
      runId: f.binding.run.publicId,
      targetId: row.stored.publicId,
      asOf: f.now.toISOString(),
    };
    return {
      ...f,
      row,
      saved,
      tx,
      command,
      options: {
        db,
        now: f.now,
        codec: createReportCursorCodec("synthetic-point-history-cursor-key-123456789"),
      },
    };
  }
  it("returns actual native positive rank with exact captured scope and explicit20-row limit", async () => {
    const f = fixture();
    const report = await readMonitorPointHistory(f.command, { actor: null }, f.options);
    expect(report).toMatchObject({
      scope: "exact_captured_target",
      limit: 20,
      hasMore: false,
      items: [{ runId: f.binding.run.publicId, position: 1, evidence: "positive", reason: null }],
    });
    expect(f.tx.localMeasurementRunItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          targetId: f.row.stored.id,
          runId: { in: [f.row.item.runId] },
        }),
        take: 1001,
      }),
    );
  });
  it("foreign target and corrupt original item scope cannot join the history", async () => {
    const f = fixture();
    await expect(
      readMonitorPointHistory(
        { ...f.command, targetId: "lmt_bcdefghijklmnopqrstuvwxyza" },
        { actor: null },
        f.options,
      ),
    ).rejects.toThrow();
    f.tx.localMeasurementRunItem.findMany.mockResolvedValue([
      { ...f.row.item, operationKey: "foreign-operation" },
    ]);
    await expect(readMonitorPointHistory(f.command, { actor: null }, f.options)).rejects.toThrow();
  });
  it("rejects a page whose observations name different original items", async () => {
    const f = fixture();
    f.tx.localMeasurementRunItem.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, index) => ({ ...f.row.item, id: `item-${index}` })),
    );
    await expect(readMonitorPointHistory(f.command, { actor: null }, f.options)).rejects.toThrow();
    expect(f.tx.localMeasurementRunItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1001 }),
    );
  });
  it("pages23 actual normalized original items20+3 with interval binding and no repeated attempts", async () => {
    const f = fixture(),
      originalRecord = f.row.item.record;
    if (!originalRecord || typeof originalRecord !== "object" || Array.isArray(originalRecord))
      throw new Error("Original retained record is not an object");
    const rows = Array.from({ length: 23 }, (_, index) => {
        const scope = { ...f.row.record.scope, idempotencyKey: `synthetic-history-${index}` },
          key = operationKey(scope),
          observationId = `history-observation-${index}`;
        return {
          ...f.row,
          record: { ...f.row.record, key, scope, collectedEvidenceId: observationId },
          item: {
            ...f.row.item,
            id: `history-item-${index}`,
            runId: `history-run-${index}`,
            operationKey: key,
            createdAt: new Date(f.now.getTime() - index * 1000),
            record: { ...originalRecord, key, scope, collectedEvidenceId: observationId },
          },
        };
      }),
      saved = rows.map((row) => resultObservation(row));
    f.tx.localMonitorOccurrence.count.mockResolvedValue(23);
    f.tx.localMonitorOccurrence.findMany.mockResolvedValue(
      rows.map((row) => ({
        ...f.binding.occurrence,
        runId: row.item.runId,
        createdAt: row.item.createdAt,
      })),
    );
    f.tx.localMeasurementRunItem.findMany.mockResolvedValue(rows.map((row) => row.item));
    f.tx.localMeasurementRun.findMany.mockResolvedValue(
      rows.map((row, index) => ({
        id: row.item.runId,
        publicId: `lmr_${String(index).padStart(24, "a")}`,
      })),
    );
    f.tx.observationRun.findMany.mockResolvedValue(saved.map((row) => row.observation));
    f.tx.businessMatchDecision.findMany.mockResolvedValue(saved.flatMap((row) => row.decisions));
    const command = {
        ...f.command,
        from: new Date(f.now.getTime() - 22000).toISOString(),
        to: f.now.toISOString(),
      },
      first = await readMonitorPointHistory(command, { actor: null }, f.options);
    expect(first).toMatchObject({
      eligibleTotal: 23,
      hasMore: true,
      window: { from: command.from, to: command.to },
    });
    expect(first.items).toHaveLength(20);
    const second = await readMonitorPointHistory(
      { ...command, cursor: first.nextCursor },
      { actor: null },
      f.options,
    );
    expect(second.items).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(23);
    expect([...first.items, ...second.items].every((item) => item.position === 1)).toBe(true);
    mocked.policy.mockResolvedValue({ state: "unconfigured", policyEpoch: "2", config: null });
    await expect(
      readMonitorPointHistory({ ...command, cursor: first.nextCursor }, { actor: null }, f.options),
    ).rejects.toThrow();
    mocked.policy.mockResolvedValue({ state: "unsupported", policyEpoch: "1", config: null });
    await expect(
      readMonitorPointHistory({ ...command, cursor: first.nextCursor }, { actor: null }, f.options),
    ).rejects.toThrow();
    mocked.policy.mockResolvedValue({ state: "unconfigured", policyEpoch: "1", config: null });
    await expect(
      readMonitorPointHistory(
        { ...command, from: undefined, cursor: first.nextCursor },
        { actor: null },
        f.options,
      ),
    ).rejects.toThrow();
    f.tx.localMeasurementRunItem.findMany.mockResolvedValue(
      rows.map((row, index) => ({
        ...row.item,
        version: index === 0 ? row.item.version + 1 : row.item.version,
      })),
    );
    await expect(
      readMonitorPointHistory({ ...command, cursor: first.nextCursor }, { actor: null }, f.options),
    ).rejects.toThrow();
  });
});
