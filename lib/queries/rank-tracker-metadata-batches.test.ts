import type { Prisma } from "@/lib/generated/prisma/client";
import { expect, it, vi } from "vitest";
import { loadRankTrackerMetadataBatches } from "./rank-tracker-metadata-batches";
import type { RankTrackerReportMetadata } from "./rank-tracker-report-model";

const project = { id: "project", publicId: "prj_project" };
const asOf = new Date("2026-10-12T10:00:00Z");
it("reads all 1201 selected targets through bounded authority calls, independent of the table page", async () => {
  const targets = Array.from({ length: 1201 }, (_, index) => ({
    id: String(index),
    publicId: `kw_${index}`,
  }));
  const loader = vi.fn(
    async (
      _tx: Prisma.TransactionClient,
      _project: typeof project,
      rows: readonly { publicId: string }[],
    ) =>
      new Map(
        rows.map(({ publicId }) => [
          publicId,
          {
            expectedScope: null,
            freshForMs: null,
            volume: null,
          } satisfies RankTrackerReportMetadata,
        ]),
      ),
  );
  const result = await loadRankTrackerMetadataBatches(loader, {} as never, project, targets, asOf);
  expect(loader.mock.calls.map((call) => call[2].length)).toEqual([500, 500, 201]);
  expect([...result.keys()]).toEqual(targets.map(({ publicId }) => publicId));
  expect([...result.values()].every(({ freshForMs }) => freshForMs === null)).toBe(true);
});
it("does not accept an unrelated ID returned from a metadata adapter", async () => {
  const loader = vi.fn(
    async () => new Map([["kw_foreign", { expectedScope: null, volume: null }]]),
  );
  await expect(
    loadRankTrackerMetadataBatches(
      loader,
      {} as never,
      project,
      [{ id: "target", publicId: "kw_target" }],
      asOf,
    ),
  ).rejects.toThrow("authorized target batch");
});
it("does not manufacture proof for missing metadata", async () => {
  const result = await loadRankTrackerMetadataBatches(
    async () => new Map(),
    {} as never,
    project,
    [{ id: "target", publicId: "kw_target" }],
    asOf,
  );
  expect(result.has("kw_target")).toBe(false);
});
