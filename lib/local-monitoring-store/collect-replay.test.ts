import { localResultFixture } from "@/lib/local-monitor-results/fixture";
import { describe, expect, it, vi } from "vitest";
import { collectLocalMeasurementItem } from "./collect-item";
import type { LocalDatabase as Database } from "./context";
import type { LocalNormalizationPort } from "./evidence-types";

const scope = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("./item-scope", async (original) => {
  const mod = await original<typeof import("./item-scope")>();
  return { ...mod, localItemScope: scope };
});
describe("already-collected production replay cannot bypass original match authority", () => {
  function setup() {
    const { binding, now } = localResultFixture(),
      row = binding.rows[0];
    scope.mockResolvedValue({
      ...row,
      scope: { project: { id: row.item.projectId } },
      run: binding.run,
      target: row.stored,
    });
    const tx = {
      observationRun: { findFirst: vi.fn(async () => ({ id: row.record.collectedEvidenceId })) },
      localMeasurementPoint: { findFirst: vi.fn(async () => ({ point: row.point })) },
    };
    const db = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as Database;
    const verify = vi.fn(async () => {}),
      normalize = vi.fn(),
      collect = vi.fn();
    const normalizer: LocalNormalizationPort = { normalize, afterPersist: verify };
    const lease = {
      projectId: row.item.projectId,
      runId: row.item.runId,
      itemId: row.item.id,
      targetId: row.item.targetId,
      key: row.record.key,
      purpose: "collect" as const,
      token: "token",
      version: 1,
      expiresAt: now.toISOString(),
    };
    const adapter = {
      collect,
      capability: {
        version: "synthetic",
        provider: "dataforseo",
        adapterVersion: row.record.adapterVersion,
        expiresAt: now.toISOString(),
        nativeBillingUnit: "cents",
        implementations: [],
      },
    };
    return { row, now, tx, db, verify, normalize, collect, normalizer, lease, adapter };
  }
  it("verifies in the original authenticated transaction, without another GET or normalization", async () => {
    const f = setup();
    const result = await collectLocalMeasurementItem(
      {
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        runId: "lmr_abcdefghijklmnopqrstuvwx",
        targetId: f.row.stored.publicId,
      },
      { actor: null },
      f.lease,
      f.adapter,
      f.normalizer,
      () => f.now,
      f.db,
    );
    expect(result).toEqual({ collected: true, replayed: true });
    expect(f.verify).toHaveBeenCalledWith({
      tx: f.tx,
      item: f.row.item,
      record: f.row.record,
      observationId: f.row.record.collectedEvidenceId,
      target: f.row.target,
      point: f.row.point,
      replay: true,
      now: f.now,
    });
    expect(f.collect).not.toHaveBeenCalled();
    expect(f.normalize).not.toHaveBeenCalled();
  });
  it("missing match authority rejects replay instead of a false complete return", async () => {
    const f = setup();
    f.verify.mockRejectedValue(new Error("Match authority unavailable"));
    await expect(
      collectLocalMeasurementItem(
        {
          projectId: "prj_abcdefghijklmnopqrstuvwx",
          runId: "lmr_abcdefghijklmnopqrstuvwx",
          targetId: f.row.stored.publicId,
        },
        { actor: null },
        f.lease,
        f.adapter,
        f.normalizer,
        () => f.now,
        f.db,
      ),
    ).rejects.toThrow("Match authority");
    expect(f.collect).not.toHaveBeenCalled();
  });
});
