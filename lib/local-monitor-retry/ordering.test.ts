import { localResultFixture } from "@/lib/local-monitor-results/fixture";
import { compareCodeUnits } from "@/lib/local-monitoring/key";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { monitorRetryRequestSchema } from "./input-schema";
import { readRetainedMonitorRetry } from "./retained";
import { assertMonitorRetryCurrent, captureMonitorRetry } from "./selection";

const ports = vi.hoisted(() => ({
  binding: vi.fn(),
  proof: vi.fn(),
  occurrence: vi.fn(),
}));
vi.mock("@/lib/local-monitor-results/binding", () => ({ readLocalResultBinding: ports.binding }));
vi.mock("./proof", () => ({ readMonitorRetryProof: ports.proof }));
vi.mock("@/lib/local-monitoring-store/occurrence-definition", () => ({
  readOccurrenceDefinition: ports.occurrence,
}));

function fixture() {
  const f = localResultFixture(3);
  const ids = ["lmt_ch" + "a".repeat(22), "lmt_d" + "a".repeat(23)];
  const rows = f.binding.rows.map((row, index) => ({
    ...row,
    stored: { ...row.stored, publicId: ids[index] ?? row.stored.publicId },
  }));
  const parent = { ...f.binding, rows };
  ports.binding.mockResolvedValue(parent);
  ports.proof.mockResolvedValue({
    eligible: true,
    reason: "eligible_unsent",
    financialState: "settled",
    nativeProof: "proven_unsent",
  });
  const tx = { $queryRaw: vi.fn().mockResolvedValue([]) } as unknown as LocalTransaction;
  const input = {
    projectId: parent.run.projectId,
    monitorId: parent.occurrence.monitorId,
    revisionId: parent.revision.id,
    scheduleIntentId: parent.occurrence.scheduleIntentId,
    retry: monitorRetryRequestSchema.parse({ parentRunId: parent.run.publicId, targetIds: ids }),
    now: f.now,
  };
  return { parent, tx, input, ids };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
describe("retry canonical ID ordering", () => {
  it("captures valid IDs in code-unit order even under the supported Czech collation", async () => {
    const { tx, input, ids } = fixture();
    const czech = new Intl.Collator("cs-CZ");
    // Reproduce the real supported locale on CI hosts with another default locale.
    vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (
      this: string,
      other: string,
    ) {
      return czech.compare(this, other);
    });
    const selected = await captureMonitorRetry(tx, input);
    expect(selected.approval.targetIds).toEqual([...ids].sort(compareCodeUnits));
    expect(selected.targets.map((target) => target.id)).toEqual(selected.approval.targetIds);
    await expect(
      assertMonitorRetryCurrent(tx, {
        ...input,
        retry: selected.approval,
        targetIds: [...ids].reverse(),
      }),
    ).resolves.toMatchObject({ approval: selected.approval });
  });

  it("normalizes retained SQL rows independently of database collation before proof comparison", async () => {
    const { tx, input, parent } = fixture();
    const selected = await captureMonitorRetry(tx, input);
    const child = {
      ...parent.run,
      id: "child-run",
      publicId: "lmr_zaaaaaaaaaaaaaaaaaaaaaaa",
      expectedTargetKeys: selected.members.map(({ row }) => row.stored.targetKey),
    };
    const header = {
      id: "selection",
      projectId: parent.run.projectId,
      monitorId: parent.occurrence.monitorId,
      parentRunId: parent.run.id,
      parentOccurrenceId: parent.occurrence.id,
      definitionRevisionId: parent.revision.id,
      scheduleIntentId: parent.occurrence.scheduleIntentId,
      parentExpectedCount: parent.run.expectedTargetKeys.length,
      sourceHash: selected.approval.sourceHash,
      selectedProofHash: selected.approval.selectedProofHash,
      command: { retry: selected.approval, targetIds: selected.approval.targetIds },
    };
    // Intentionally opposite the signed order: do not trust a database locale here.
    const members = selected.members
      .map(({ row, proof }) => ({
        parentItemId: row.item.id,
        targetId: row.stored.id,
        targetKey: row.stored.targetKey,
        publicId: row.stored.publicId,
        recordVersion: row.item.version,
        recordSnapshot: row.record,
        nativeState: proof.financialState,
        nativeProof: proof.nativeProof,
      }))
      .reverse();
    const original = parent.rows.map(({ item, stored }) => ({
      itemId: item.id,
      targetId: stored.publicId,
      targetKey: stored.targetKey,
      internalTargetId: stored.id,
    }));
    const retainedTx = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([header])
        .mockResolvedValueOnce(members)
        .mockResolvedValueOnce(original),
      localMeasurementRun: {
        findFirst: vi.fn().mockResolvedValueOnce(parent.run).mockResolvedValueOnce(child),
      },
    } as unknown as LocalTransaction;
    ports.occurrence.mockResolvedValueOnce(parent).mockResolvedValueOnce({
      ...parent,
      occurrence: { ...parent.occurrence, id: "child-occurrence" },
    });
    await expect(
      readRetainedMonitorRetry(retainedTx, parent.run.projectId, child.id),
    ).resolves.toMatchObject({ targetIds: selected.approval.targetIds });
  });
});
