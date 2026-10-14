import { writeFileSync } from "node:fs";
import { AuthorizationError } from "@/lib/auth/authorize";
import {
  LocalResultCapacityError,
  LocalResultSelectionError,
  LocalResultSnapshotConflictError,
} from "@/lib/local-monitor-results/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalMonitorReadSelection } from "./local-monitor-read-input";
import { readLocalMonitorApi } from "./local-monitor-results";
import { localTransportFixture, localTransportIds } from "./local-monitor-transport-fixture";
import { exportTestContext } from "./rank-history-api-test-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
const audit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/keywords/export-audit", () => ({ auditKeywordExport: audit }));
function context(query = "") {
  const ctx = exportTestContext(query);
  ctx.auth.project.id = "synthetic-project";
  ctx.auth.apiKey.projectId = ctx.auth.project.id;
  return ctx;
}
const selection = (kind: LocalMonitorReadSelection["kind"], targetId?: string) => ({
  kind,
  projectId: localTransportIds.projectId,
  monitorId: localTransportIds.monitorId,
  ...(kind === "history" ? {} : { runId: localTransportIds.runId }),
  ...(targetId ? { targetId } : {}),
});

describe("actual Local retained transport projection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date("2026-10-13T00:00:00.000Z"));
  });
  it("retains exact IDs, quality, signed selection fields and real string CID through all five API reads", async () => {
    const f = localTransportFixture(),
      targetId = f.result.points[0].id;
    const captured: Record<string, unknown> = {};
    for (const [name, kind] of [
      ["result", "result"],
      ["history", "history"],
      ["listings", "listings"],
      ["point_history", "point_history"],
      ["export_json", "export"],
    ] as const) {
      const response = await readLocalMonitorApi(
        context(`?as_of=${f.result.asOf}`),
        selection(kind, kind === "listings" || kind === "point_history" ? targetId : undefined),
        f.ports,
      );
      expect(response.status, `${name}: ${await response.clone().text()}`).toBe(200);
      captured[name] = await response.json();
    }
    const unknown = localTransportFixture(true);
    captured.result_unknown = await (
      await readLocalMonitorApi(
        context(`?as_of=${unknown.result.asOf}`),
        selection("result"),
        unknown.ports,
      )
    ).json();
    const stale = localTransportFixture(false, new Date(f.now.getTime() + 7_200_000));
    captured.result_stale = await (
      await readLocalMonitorApi(
        context(`?as_of=${stale.result.asOf}`),
        selection("result"),
        stale.ports,
      )
    ).json();
    const csv = await readLocalMonitorApi(
      context(`?format=csv&as_of=${f.result.asOf}`),
      selection("export"),
      f.ports,
    );
    expect(csv.status).toBe(200);
    captured.export_csv = await csv.text();
    expect(captured.result).toMatchObject({
      data: {
        run_id: f.result.runId,
        points: [
          {
            position: 3,
            evidence: "positive",
            scope_class: "coordinate_seed",
            latitude: "52.0000000",
            longitude: "-21.0000000",
          },
        ],
        freshness_policy: { policy_epoch: "8", basis: "manual_ttl", fresh_for_ms: 3_600_000 },
      },
    });
    expect(captured.result_unknown).toMatchObject({
      data: { points: [{ position: null, evidence: "unknown", scope_class: "unavailable" }] },
    });
    expect(captured.result_stale).toMatchObject({ data: { points: [{ freshness: "stale" }] } });
    expect(captured.listings).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({
          cid: "9007199254740993123",
          rank_group: 3,
          rank_scale: "maps_organic",
        }),
        expect.objectContaining({ promotion: "promoted", cid: null, rank_scale: null }),
        expect.objectContaining({ cid: "9007199254740993124", matched: "rejected" }),
      ]),
    });
    expect(captured.history).toMatchObject({
      data: {
        window: { time_basis: "occurrence_created_at" },
        next_cursor: null,
        eligible_total: 1,
      },
    });
    expect(captured.point_history).toMatchObject({
      data: { target_id: targetId, policy_epoch: "8", eligible_total: 1 },
    });
    expect(captured.export_json).toMatchObject({
      report: "local-point-report-v1",
      financialBasis: "current_accounting_state",
      points: [{ longitude: "-21.0000000" }],
    });
    expect(captured.export_csv).toContain('"-21.0000000"');
    expect(JSON.stringify(captured)).not.toMatch(
      /taskIds|credentialVersion|correlationId|rawFragment|requestPolicy|costCents/,
    );
    expect(audit).toHaveBeenCalledTimes(2);
    if (process.env.BISIBILITY_LOCAL_TRANSPORT_FIXTURE_OUTPUT)
      writeFileSync(
        process.env.BISIBILITY_LOCAL_TRANSPORT_FIXTURE_OUTPUT,
        JSON.stringify(captured, null, 2) + "\n",
      );
  });
  it("rejects foreign project, invalid/repeated IDs and unsupported selection before reads or audit", async () => {
    const f = localTransportFixture(),
      read = vi.spyOn(f.ports, "result");
    for (const [query, scope] of [
      ["", { ...selection("result"), projectId: "prj_bbcdefghijklmnopqrstuvwx" }],
      ["?as_of=2026-10-12T12:00:00Z", selection("result")],
      ["?as_of=2099-01-01T00:00:00.000Z", selection("result")],
      ["?as_of=x&as_of=y", selection("result")],
      ["?provider_task_id=foreign", selection("result")],
      ["", { ...selection("result"), runId: "rcr_abcdefghijklmnopqrstuvwx" }],
    ] as const) {
      const response = await readLocalMonitorApi(context(query), scope, f.ports);
      expect(response.status).toBe(
        query === "" && scope.projectId !== localTransportIds.projectId ? 403 : 400,
      );
    }
    expect(read).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
  it("preserves controlled revoked access, capacity, snapshot and signed-window refusals without successful audit", async () => {
    for (const [error, status] of [
      [new AuthorizationError("forbidden"), 403],
      [new LocalResultCapacityError(), 413],
      [new LocalResultSnapshotConflictError(), 409],
      [new LocalResultSelectionError(), 400],
    ] as const) {
      const f = localTransportFixture();
      vi.spyOn(f.ports, "result").mockRejectedValue(error);
      expect((await readLocalMonitorApi(context(), selection("export"), f.ports)).status).toBe(
        status,
      );
    }
    expect(audit).not.toHaveBeenCalled();
  });
});
