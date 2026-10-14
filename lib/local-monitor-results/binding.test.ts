import type { Prisma } from "@/lib/generated/prisma/client";
import { localDigest, localKeywordRevision } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { describe, expect, it, vi } from "vitest";
import { readLocalResultBinding } from "./binding";
import { localResultFixture } from "./fixture";

describe("real immutable occurrence and complete expected-set binding", () => {
  function fixture() {
    const f = localResultFixture(3);
    const tx = {
      $queryRaw: vi.fn(async () => []),
      localMonitor: { findFirst: vi.fn(async () => ({ id: f.binding.occurrence.monitorId })) },
      localMeasurementRun: { findFirst: vi.fn(async () => f.binding.run) },
      localMonitorOccurrence: { findFirst: vi.fn(async () => f.binding.occurrence) },
      localMonitorRevision: { findFirst: vi.fn(async () => f.binding.revision) },
      localMeasurementRunItem: {
        findMany: vi.fn(async () => f.binding.rows.map((row) => row.item)),
      },
      localMeasurementTarget: {
        findMany: vi.fn(async () => f.binding.rows.map((row) => row.stored)),
      },
      localMeasurementPoint: {
        findMany: vi.fn(async () =>
          f.binding.rows.map((row) => ({ id: row.stored.pointId, point: row.point })),
        ),
      },
    };
    return { ...f, tx };
  }
  it("reconstructs original grid/keywords and preserves9 points without current keyword reads", async () => {
    const f = fixture();
    const bound = await readLocalResultBinding(
      f.tx as unknown as LocalTransaction,
      f.binding.run.projectId,
      "lmn_abcdefghijklmnopqrstuvwx",
      f.binding.run.publicId,
      f.now,
    );
    expect(bound.rows).toHaveLength(9);
    expect(bound.definition).toEqual(f.binding.definition);
    expect(bound.rows[0].target.keywordRevision).toBe(
      localKeywordRevision(bound.definition.keywords[0]),
    );
    expect(f.tx.localMonitorRevision.findFirst).toHaveBeenCalledWith({
      where: {
        projectId: f.binding.run.projectId,
        monitorId: f.binding.occurrence.monitorId,
        id: f.binding.revision.id,
      },
    });
  });
  it.each(["measurementTargetEpoch", "measurementPolicyEpoch"] as const)(
    "rejects a changed retained %s with the original accepted target key",
    async (field) => {
      const f = fixture();
      const changed = {
        ...f.binding.definition,
        keywords: f.binding.definition.keywords.map((keyword) => ({
          ...keyword,
          [field]: "9007199254740993123",
        })),
      };
      f.tx.localMonitorRevision.findFirst.mockResolvedValue({
        ...f.binding.revision,
        contentHash: localDigest(changed),
        snapshot: changed as unknown as Prisma.JsonObject,
      });
      await expect(
        readLocalResultBinding(
          f.tx as unknown as LocalTransaction,
          f.binding.run.projectId,
          "lmn_abcdefghijklmnopqrstuvwx",
          f.binding.run.publicId,
          f.now,
        ),
      ).rejects.toThrow();
    },
  );
  it.each(["missing", "foreignMonitor", "changedSnapshot", "missingPoint"])(
    "rejects %s instead of partial/wider membership",
    async (kind) => {
      const f = fixture();
      if (kind === "missing")
        f.tx.localMeasurementTarget.findMany.mockResolvedValue(
          f.binding.rows.slice(1).map((row) => row.stored),
        );
      if (kind === "foreignMonitor")
        f.tx.localMonitor.findFirst.mockResolvedValue({ id: "foreign-monitor" });
      if (kind === "changedSnapshot")
        f.tx.localMonitorRevision.findFirst.mockResolvedValue({
          ...f.binding.revision,
          contentHash: "b".repeat(64),
        });
      if (kind === "missingPoint") f.tx.localMeasurementPoint.findMany.mockResolvedValue([]);
      await expect(
        readLocalResultBinding(
          f.tx as unknown as LocalTransaction,
          f.binding.run.projectId,
          "lmn_abcdefghijklmnopqrstuvwx",
          f.binding.run.publicId,
          f.now,
        ),
      ).rejects.toThrow();
    },
  );
});
