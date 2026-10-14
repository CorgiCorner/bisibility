import { AuthorizationError } from "@/lib/auth/authorize";
import { historyExportSnapshotFixture } from "@/lib/rank-history/report-export-test-fixture";
import { createReportCursorCodec } from "@/lib/rank-reports/cursor";
import { reportAsOf, reportPolicy, reportProject } from "@/lib/rank-reports/report-test-fixture";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOpenApiDocument } from "./openapi";
import { rankHistoryReportSchemas } from "./openapi-rank-history-report";
import { encodeOffsetCursor } from "./pagination";
import { exportTestContext as context } from "./rank-history-api-test-fixture";
import { exportRankHistory } from "./rank-history-export";

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/rank-history/export-snapshot", () => ({
  loadHistoryExportSnapshot: mocks.snapshot,
}));
vi.mock("@/lib/keywords/export-audit", () => ({ auditKeywordExport: mocks.audit }));
vi.mock("@/lib/rank-reports/host-cursor", () => ({
  hostRankReportCursorCodec: () => createReportCursorCodec("synthetic-controller-cursor-key-only"),
}));
vi.mock("@/lib/rank-history/export-host", () => ({
  historyExportReportOptions: (_context: unknown, asOf = reportAsOf) => ({
    asOf,
    limits: { maxTargets: 1000, maxChecks: 1000, maxItems: 1000 },
    policyAt: () => ({ ...reportPolicy(), asOf }),
    loadMetadata: async () => new Map(),
  }),
}));

function keys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object");
  return Object.keys(value);
}
describe("existing export route report mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(reportAsOf);
    mocks.snapshot.mockImplementation(async () => historyExportSnapshotFixture());
  });
  it("preserves the v1 envelope/fields and emits a complete v2 attempt/summary DTO", async () => {
    const old = await exportRankHistory(context("?range=all"), reportProject.publicId);
    const oldBody = await old.json();
    expect(keys(oldBody.meta)).toEqual(["next_cursor"]);
    expect(keys(oldBody.data[0]).sort()).toEqual(
      [
        "checked_at",
        "id",
        "keyword",
        "keyword_id",
        "normalization_version",
        "position",
        "previous_position",
        "provider",
        "ranking_url",
        "requested_depth",
      ].sort(),
    );
    const response = await exportRankHistory(
      context("?version=2&range=all&stream=attempts&limit=1"),
      reportProject.publicId,
    );
    const body = await response.json();
    expect(response.headers.get("X-Test")).toBe("preserved");
    expect(body.data[0]).toMatchObject({
      status: "failed",
      kind: "logical_rank_check",
      error_code: "provider_failed",
    });
    expect(body.meta.report).toMatchObject({
      total_count: 2,
      summary: { retained_history: { targets: 1, checks: 2 } },
    });
    const schema = rankHistoryReportSchemas.RankHistoryReportRecord.oneOf[1];
    for (const key of keys(body.data[0])) expect(schema.properties).toHaveProperty(key);
    expect(JSON.stringify(body)).not.toContain("internal_actor_never_output");
    expect(JSON.stringify(body)).not.toContain("internal_key_never_output");
  });
  it("validates the actual empty-window v2 response against the published response union", async () => {
    const response = await exportRankHistory(
      context("?version=2&from=2026-10-12T11:30:00Z&to=2026-10-12T11:45:00Z"),
      reportProject.publicId,
    );
    const body = await response.json();
    expect(body.data).toEqual([]);
    expect(body.meta.report.version).toBe(2);
    const document = getOpenApiDocument();
    const schema = {
      ...document,
      $ref: "#/paths/~1projects~1{project_id}~1exports~1rank-history/get/responses/200/content/application~1json/schema",
    };
    const validate = new AjvJsonSchemaValidator().getValidator(schema);
    expect(validate(body)).toMatchObject({ valid: true });
    const validateV2 = new AjvJsonSchemaValidator().getValidator({
      ...document,
      $ref: "#/components/schemas/RankHistoryReportResponse",
    });
    expect(validateV2(body)).toMatchObject({ valid: true });
    expect(validate({ ...body, meta: { report: body.meta.report } }).valid).toBe(false);
    for (const stream of ["observations", "attempts"]) {
      const nonempty = await exportRankHistory(
        context(`?version=2&range=all&stream=${stream}`),
        reportProject.publicId,
      );
      const value = await nonempty.json();
      expect(value.data.length).toBeGreaterThan(0);
      expect(validate(value)).toMatchObject({ valid: true });
      expect(validateV2(value)).toMatchObject({ valid: true });
    }
    const legacy = await exportRankHistory(context("?range=all"), reportProject.publicId);
    expect(validate(await legacy.json())).toMatchObject({ valid: true });
  });
  it("returns controlled invalid_cursor in V2 before exposing rows or accepting a legacy offset", async () => {
    const cursor = Buffer.from(JSON.stringify({ v: 3, o: 20 })).toString("base64url");
    const response = await exportRankHistory(
      context(`?version=2&range=all&cursor=${cursor}`),
      reportProject.publicId,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      type: expect.stringContaining("invalid_cursor"),
    });
    expect(mocks.snapshot).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("audits v2 creation once while preserving legacy per-response audit semantics", async () => {
    for (const version of ["1", "2"]) {
      mocks.audit.mockClear();
      const first = await exportRankHistory(
        context(
          `?version=${version}&range=all&stream=${version === "2" ? "attempts" : "observations"}&limit=1`,
        ),
        reportProject.publicId,
      );
      const body = await first.json();
      if (version === "2") expect(body.meta.next_cursor).toEqual(expect.any(String));
      expect(mocks.audit).toHaveBeenCalledTimes(1);
      const next = await exportRankHistory(
        context(
          `?version=${version}&range=all&stream=${version === "2" ? "attempts" : "observations"}&limit=1&cursor=${encodeURIComponent(body.meta.next_cursor ?? encodeOffsetCursor(1))}`,
        ),
        reportProject.publicId,
      );
      expect(next.status).toBe(200);
      expect((await next.json()).meta.next_cursor).toBeNull();
      expect(mocks.audit).toHaveBeenCalledTimes(version === "2" ? 1 : 2);
    }
    mocks.audit.mockClear();
    mocks.snapshot.mockRejectedValueOnce(new AuthorizationError("forbidden"));
    const revoked = await exportRankHistory(
      context("?version=2&range=all"),
      reportProject.publicId,
    );
    expect(revoked.status).toBe(403);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("CSV contains a full manifest and cannot become a partial continuation download", async () => {
    const full = await exportRankHistory(
      context("?version=2&range=all&format=csv"),
      reportProject.publicId,
    );
    const text = await full.text();
    expect(text).toContain("record_type,report_metadata");
    expect(text).toContain("retainedHistory");
    expect(full.headers.get("X-Bisibility-Report-Version")).toBe("2");
    const invalid = exportRankHistory(
      context("?version=2&format=csv&cursor=opaque"),
      reportProject.publicId,
    );
    await expect(invalid).rejects.toThrow();
  });
});
