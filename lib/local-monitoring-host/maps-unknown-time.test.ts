import type { Prisma } from "@/lib/generated/prisma/client";
import { localPointEvidence } from "@/lib/local-monitor-results/evidence";
import { exportLocalRunResult } from "@/lib/local-monitor-results/export";
import { localResultFixture, resultObservation } from "@/lib/local-monitor-results/fixture";
import { projectLocalRun } from "@/lib/local-monitor-results/projection";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { assertLocalObservationProof } from "@/lib/local-monitoring-store/evidence-proof";
import { mapsTaskRequest } from "@/lib/providers/local-search/maps-capability";
import { parseMapsResult } from "@/lib/providers/local-search/maps-result";
import { mapsResultEnvelope, nativeIds } from "@/lib/providers/local-search/maps-test-fixtures";
import { describe, expect, it, vi } from "vitest";
import { retainMapsCollectionMatch } from "./maps-match";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@/lib/local-monitoring-store/occurrence-definition", () => ({
  readOccurrenceDefinition: capture,
}));
function fixture() {
  const f = localResultFixture(),
    row = f.binding.rows[0],
    saved = resultObservation(row),
    binding = {
      target: row.target,
      point: row.point,
      keyword: {
        id: row.target.keywordId,
        revision: row.target.keywordRevision,
        text: row.keyword.text,
      },
      requestedAt: null,
    };
  const data = mapsResultEnvelope(),
    body: unknown = JSON.parse(String(mapsTaskRequest(binding).body));
  if (!Array.isArray(body) || !body[0] || typeof body[0] !== "object")
    throw new Error("Invalid synthetic Maps request");
  data.tasks[0].data = {
    ...body[0],
    api: "serp",
    function: "task_get",
    se: "google",
    se_type: "maps",
  };
  data.tasks[0].result[0].keyword = row.keyword.text;
  const native: Record<string, unknown> = data.tasks[0].result[0];
  delete native.datetime;
  const run = parseMapsResult(data, nativeIds[0], binding, f.now),
    oldPolicy = saved.observation.requestPolicy;
  if (!oldPolicy || typeof oldPolicy !== "object" || Array.isArray(oldPolicy))
    throw new Error("Invalid synthetic policy");
  const observation = {
    ...saved.observation,
    requestPolicy: {
      ...run.requestPolicy,
      localExecution: {
        version: 1,
        operationKey: row.record.key,
        targetKey: row.record.targetKey,
        acceptedTaskIdsHash: localDigest([...row.record.outcome!.taskIds].sort()),
        normalizedHash: localDigest(run),
      },
    } as unknown as Prisma.JsonObject,
    items: saved.observation.items.map((item) => ({ ...item, observedAt: null })),
  };
  const tx = {
    observationRun: { findFirst: vi.fn(async () => observation) },
    businessMatchHead: { count: vi.fn(async () => 0), create: vi.fn() },
    businessMatchDecision: { count: vi.fn(async () => 0), create: vi.fn() },
  };
  capture.mockResolvedValue(f.binding);
  const input = {
    tx: tx as unknown as LocalTransaction,
    item: row.item,
    record: row.record,
    observationId: observation.id,
    target: row.target,
    point: row.point,
    replay: false,
    now: f.now,
  };
  return { ...f, row, run, observation, tx, input };
}
describe("unknown native provider observation time remains collected evidence", () => {
  it("original parser/proof permit null time and match capture/replay invent no timestamped decisions", async () => {
    const f = fixture();
    expect(f.run.items).toHaveLength(3);
    expect(f.run.items.every((item) => item.observedAt === null)).toBe(true);
    expect(() =>
      assertLocalObservationProof(
        f.run,
        f.row.record,
        {
          taskIds: [...f.row.record.outcome!.taskIds],
          observedAt: null,
          payload: null,
          completeness: "unknown",
          completeThrough: null,
        },
        f.row.target,
        f.row.point,
      ),
    ).not.toThrow();
    await retainMapsCollectionMatch(f.input);
    await retainMapsCollectionMatch({ ...f.input, replay: true });
    expect(f.tx.businessMatchHead.create).not.toHaveBeenCalled();
    expect(f.tx.businessMatchDecision.create).not.toHaveBeenCalled();
  });
  it("read/metric/export preserve collected receipt and unknown quality without rank or absence", () => {
    const f = fixture(),
      proof = localPointEvidence(
        f.row,
        f.observation,
        [],
        f.binding.definition.identityRevisionId,
        f.now,
      ),
      report = projectLocalRun(f.binding, new Map([[f.row.item.id, proof]]), f.receipt, f.now);
    expect(report.points[0]).toMatchObject({
      position: null,
      observedPosition: null,
      evidence: "unknown",
      reason: "missing_observation_time",
      identityMatch: "unavailable",
      observedAt: null,
      receipt: { collected: true, resolution: "complete" },
    });
    expect(report.grids[0]).toMatchObject({
      observedRate: null,
      counts: { metricEligible: 0, knownAbsent: 0 },
    });
    const exported = exportLocalRunResult(
      {
        version: 1,
        projectId: "prj_abcdefghijklmnopqrstuvwx",
        monitorId: "lmn_abcdefghijklmnopqrstuvwx",
        runId: f.binding.run.publicId,
        asOf: f.now.toISOString(),
        createdAt: f.binding.run.createdAt.toISOString(),
        definitionRevisionId: f.binding.revision.id,
        definitionRevision: 1,
        identityRevisionId: f.binding.definition.identityRevisionId,
        subject: "Synthetic business",
        protocol: {
          geometry: f.binding.definition.grid.geometryModel,
          matcher: "business-match-maps-v1",
          normalizerVersions: [f.row.record.adapterVersion],
          metricDefinition: "sampled-grid-top-n-v1",
        },
        financialBasis: "current_accounting_state",
        receipt: f.receipt,
        ...report,
      },
      "json",
    );
    expect(JSON.parse(exported.text).points[0]).toMatchObject({
      evidence: "unknown",
      observedAt: null,
      position: null,
      reason: "missing_observation_time",
    });
  });
  it("rejects a timestamped match or mixed unknown-time item rather than legitimizing it", async () => {
    const f = fixture();
    f.tx.businessMatchDecision.count.mockResolvedValue(1);
    await expect(retainMapsCollectionMatch(f.input)).rejects.toThrow("timestamped");
    const mixed = {
      ...f.observation,
      items: [{ ...f.observation.items[0], observedAt: f.now }, ...f.observation.items.slice(1)],
    };
    expect(() =>
      localPointEvidence(f.row, mixed, [], f.binding.definition.identityRevisionId, f.now),
    ).toThrow("binding");
  });
});
