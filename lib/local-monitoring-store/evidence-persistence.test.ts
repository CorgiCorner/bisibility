import type { Prisma } from "@/lib/generated/prisma/client";
import { localResultFixture, resultObservation } from "@/lib/local-monitor-results/fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "./context";
import { neutralLocalEvidencePort } from "./evidence-persistence";
import type { LocalNormalizationPort } from "./evidence-types";

const locks = vi.hoisted(() => ({
  item: vi.fn(),
  custody: vi.fn(),
  lease: vi.fn(),
  release: vi.fn(),
}));
vi.mock("./repository", () => ({ lockedLocalItem: locks.item }));
vi.mock("./custody", () => ({ assertLocalCustody: locks.custody }));
vi.mock("./continuation-lease", () => ({ assertLocalContinuationLease: locks.lease }));
vi.mock("./ownership", () => ({ releaseProvenLocalOwner: locks.release }));
describe("match projection stays within original evidence CAS transaction", () => {
  beforeEach(() => vi.clearAllMocks());
  function setup() {
    const { binding, now } = localResultFixture(),
      row = binding.rows[0],
      saved = resultObservation(row),
      record = { ...row.record, collectedEvidenceId: null };
    locks.item.mockResolvedValue({ item: row.item, record });
    let existing: { id: string; requestPolicy: Prisma.InputJsonValue } | null = null;
    const tx = {
      $queryRaw: vi.fn(),
      observationRun: {
        findFirst: vi.fn(async () => existing),
        create: vi.fn(async ({ data }: { data: { requestPolicy: Prisma.InputJsonValue } }) => {
          existing = { id: saved.observation.id, requestPolicy: data.requestPolicy };
          return existing;
        }),
      },
      observationItem: { createMany: vi.fn(async () => ({ count: 3 })) },
      localMeasurementRunItem: { updateMany: vi.fn(async () => ({ count: 1 })) },
    };
    const db = {
      localMeasurementTarget: { findFirst: vi.fn(async () => row.stored) },
      localMeasurementPoint: { findFirst: vi.fn(async () => ({ point: row.point })) },
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as LocalDatabase;
    const normalize = vi.fn(async () => saved.run),
      verify = vi.fn<NonNullable<LocalNormalizationPort["afterPersist"]>>(async () => {}),
      lease = {
        projectId: row.item.projectId,
        runId: row.item.runId,
        itemId: row.item.id,
        targetId: row.item.targetId,
        key: row.record.key,
        token: "synthetic-token",
        version: 1,
        expiresAt: new Date(now.getTime() + 60000).toISOString(),
        purpose: "collect" as const,
      };
    const outcome = record.outcome,
      evidence = saved.run.requestPolicy.evidence;
    if (!outcome || !evidence)
      throw new Error("Accepted fixture outcome and observation evidence are required.");
    const port = neutralLocalEvidencePort(
        db,
        lease,
        { normalize, afterPersist: verify },
        () => now,
      ),
      input = {
        record,
        result: {
          taskIds: [...outcome.taskIds],
          observedAt: evidence.observedAt,
          payload: null,
          completeness: "unknown" as const,
          completeThrough: null,
        },
      };
    return { row, record, saved, now, tx, db, verify, port, input };
  }
  it("capture follows normalization and custody, precedes collected CAS and owner release, and replay does not recreate observations", async () => {
    const f = setup();
    await expect(f.port.persist(f.input)).resolves.toEqual({ evidenceId: f.saved.observation.id });
    expect(f.verify).toHaveBeenCalledWith({
      tx: f.tx,
      item: f.row.item,
      record: f.record,
      observationId: f.saved.observation.id,
      target: f.row.target,
      point: f.row.point,
      replay: false,
      now: f.now,
    });
    expect(f.verify.mock.invocationCallOrder[0]).toBeLessThan(
      f.tx.localMeasurementRunItem.updateMany.mock.invocationCallOrder[0],
    );
    expect(f.tx.localMeasurementRunItem.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      locks.release.mock.invocationCallOrder[0],
    );
    await f.port.persist(f.input);
    expect(f.verify.mock.calls[1][0].replay).toBe(true);
    expect(f.tx.observationRun.create).toHaveBeenCalledTimes(1);
    expect(f.tx.localMeasurementRunItem.updateMany).toHaveBeenCalledTimes(1);
  });
  it("failed authority blocks collected CAS and owner release; rejection propagates to transaction rollback", async () => {
    const f = setup();
    f.verify.mockRejectedValue(new Error("Original match capture failed"));
    await expect(f.port.persist(f.input)).rejects.toThrow("match capture");
    expect(f.tx.localMeasurementRunItem.updateMany).not.toHaveBeenCalled();
    expect(locks.release).not.toHaveBeenCalled();
    expect(f.tx.observationItem.createMany).toHaveBeenCalledTimes(1);
  });
});
