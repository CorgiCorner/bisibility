import { writeFileSync } from "node:fs";
import { transportHistorySnapshot } from "@/lib/rank-history/report-transport-test-fixture";
import { createReportCursorCodec } from "@/lib/rank-reports/cursor";
import { reportAsOf, reportPolicy, reportProject } from "@/lib/rank-reports/report-test-fixture";
import { expect, it, vi } from "vitest";
import { exportTestContext } from "./rank-history-api-test-fixture";
import { exportRankHistory } from "./rank-history-export";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/rank-history/export-snapshot", () => ({
  loadHistoryExportSnapshot: async (
    _context: unknown,
    input: { keywordIds?: readonly string[]; includeUnobservedRuns?: boolean },
  ) => transportHistorySnapshot(input.keywordIds, input.includeUnobservedRuns),
}));
vi.mock("@/lib/keywords/export-audit", () => ({ auditKeywordExport: async () => undefined }));
vi.mock("@/lib/rank-reports/host-cursor", () => ({
  hostRankReportCursorCodec: () => createReportCursorCodec("synthetic-transport-fixture-key-only"),
}));
vi.mock("@/lib/rank-history/export-host", () => ({
  historyExportReportOptions: (_context: unknown, asOf = reportAsOf) => ({
    asOf,
    limits: { maxTargets: 1000, maxChecks: 1000, maxItems: 1000 },
    policyAt: () => ({ ...reportPolicy(), asOf }),
    loadMetadata: async () => new Map(),
  }),
}));

it("captures the actual existing route envelopes for cross-transport compatibility", async () => {
  vi.setSystemTime(reportAsOf);
  const packets: Record<string, unknown> = {};
  const keyword = "kw_abcdefghijklmnopqrstuvwx";
  const shared = `version=2&range=all&aggregation=none&keyword_id=${keyword}&from=1970-01-01T00:00:00Z&to=2026-10-12T12:00:00Z`;
  const selections = {
    legacy: "?range=all",
    observations: `?${shared}&stream=observations&basis=observed_at&limit=200`,
    attempts: `?${shared}&stream=attempts&basis=recorded_at&limit=1`,
    recorded: `?${shared}&stream=observations&basis=recorded_at&limit=200`,
    full_attempts:
      "?version=2&range=all&aggregation=none&from=1970-01-01T00:00:00Z&to=2026-10-12T12:00:00Z&stream=attempts&basis=recorded_at&limit=200",
  };
  for (const [name, query] of Object.entries(selections)) {
    const response = await exportRankHistory(exportTestContext(query), reportProject.publicId);
    expect(response.status).toBe(200);
    packets[name] = await response.json();
  }
  packets.queries = selections;
  expect(packets).toMatchObject({
    observations: {
      data: expect.arrayContaining([
        expect.objectContaining({
          position: 4,
          ranking_url: "https://example.com/old",
          evidence: "positive",
        }),
      ]),
      meta: { report: { version: 2, summary: { retained_history: { checks: 5, targets: 1 } } } },
    },
    attempts: {
      data: [expect.objectContaining({ kind: "rank_check_run", rank_check_state: "not_attached" })],
      meta: { next_cursor: expect.any(String), report: { unresolved_membership_count: 1 } },
    },
    full_attempts: {
      data: expect.arrayContaining([
        expect.objectContaining({
          kind: "rank_check_run",
          scope_membership: "project_only",
          blocked_reason: "budget_exhausted",
        }),
      ]),
      meta: { report: { unresolved_membership_count: 0 } },
    },
  });
  const pages: unknown[] = [];
  let cursor: string | null = null;
  do {
    const response = await exportRankHistory(
      exportTestContext(
        `?${shared}&stream=attempts&basis=recorded_at&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      ),
      reportProject.publicId,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    pages.push(body);
    cursor = body.meta.next_cursor;
  } while (cursor !== null);
  expect(pages).toHaveLength(11);
  const runItems = pages
    .flatMap((page) => {
      if (!page || typeof page !== "object" || !("data" in page) || !Array.isArray(page.data))
        throw new Error("Invalid actual transport page");
      return page.data;
    })
    .filter((row) => row.kind === "rank_check_run_item");
  expect(runItems.map((row) => row.status).sort()).toEqual(["blocked", "cancelled", "deferred"]);
  for (const row of runItems)
    for (const field of [
      "check_id",
      "position",
      "observed_at",
      "checked_at",
      "provider",
      "cost_cents",
    ])
      expect(row).not.toHaveProperty(field);
  packets.attempt_pages = pages;
  const nested = packets.observations;
  expect(nested).toMatchObject({
    data: expect.arrayContaining([
      expect.objectContaining({
        normalized_items: [
          expect.objectContaining({
            cid: "18446744073709551615",
            promotion: "organic",
            source_ordinal: 3,
            source_block_id: "retained-block-2",
          }),
        ],
      }),
    ]),
    meta: {
      report: {
        normalized_items: { total_count: 1, is_truncated: false, paging: "observation_pages_only" },
      },
    },
  });
  for (const [name, selection] of [
    ["csv_observations", selections.observations],
    ["csv_attempts", selections.full_attempts],
  ]) {
    const response = await exportRankHistory(
      exportTestContext(`${selection}&format=csv`),
      reportProject.publicId,
    );
    expect(response.status).toBe(200);
    packets[name] = await response.text();
  }
  // Opt-in regeneration of the reviewed, provider-free transport fixture.
  const output = process.env.BISIBILITY_TRANSPORT_FIXTURE_OUTPUT;
  if (output) writeFileSync(output, `${JSON.stringify(packets, null, 2)}\n`);
});
