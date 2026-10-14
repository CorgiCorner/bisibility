import { makePublicId } from "@/lib/db/public-id";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  rankReportTestDatabase,
  rankReportTestOptions,
  rankReportTestRequest,
} from "./postgres-test-fixture";
import { reportAsOf } from "./report-test-fixture";
import { readRankReportFor } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn(async () => ({})) }));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "rank report frozen authorized request contract",
  () => {
    let fixture: Awaited<ReturnType<typeof rankReportTestDatabase>>;
    beforeAll(async () => {
      fixture = await rankReportTestDatabase();
    }, 60000);
    afterAll(async () => {
      await fixture?.close();
    });
    const request = () => rankReportTestRequest(fixture.project, fixture.keyword);

    it("binds the cursor to verified identity, credential, transport, full scope and window", async () => {
      const first = await readRankReportFor(
        fixture.context,
        request(),
        rankReportTestOptions(),
        fixture.db,
      );
      if (!first.nextCursor) throw new Error("Expected multipage history fixture");
      const input = { ...request(), cursor: first.nextCursor };
      await expect(
        readRankReportFor(
          {
            ...fixture.context,
            actor: { ...fixture.context.actor, id: "different-verified-user" },
          },
          input,
          rankReportTestOptions(),
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        readRankReportFor(
          { ...fixture.context, credentialId: "different-verified-credential" },
          input,
          rankReportTestOptions(),
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        readRankReportFor(
          { ...fixture.context, transport: "project_key" },
          input,
          rankReportTestOptions(),
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        readRankReportFor(
          fixture.context,
          { ...input, selectedIds: [] },
          rankReportTestOptions(),
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        readRankReportFor(
          fixture.context,
          { ...input, window: { ...input.window, from: "2026-10-02T00:00:00Z" } },
          rankReportTestOptions(),
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("refuses changed retained weights and policy definitions across pages", async () => {
      const first = await readRankReportFor(
        fixture.context,
        request(),
        rankReportTestOptions(),
        fixture.db,
      );
      if (!first.nextCursor) throw new Error("Expected multipage history fixture");
      const input = { ...request(), cursor: first.nextCursor };
      await expect(
        readRankReportFor(
          fixture.context,
          input,
          {
            ...rankReportTestOptions(),
            loadMetadata: async () => new Map([[fixture.keyword.publicId, { volume: 100 }]]),
          },
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 409 });
      const options = rankReportTestOptions();
      await expect(
        readRankReportFor(
          fixture.context,
          input,
          {
            ...options,
            policyAt: (asOf) => {
              const policy = options.policyAt(asOf);
              return {
                ...policy,
                metric: { ...policy.metric, definitionVersion: "synthetic-ranking-v2" },
              };
            },
          },
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("refuses a budget overflow without returning a partial whole-scope report", async () => {
      await expect(
        readRankReportFor(
          fixture.context,
          request(),
          {
            ...rankReportTestOptions(),
            limits: { maxChecks: 100, maxItems: 100, maxTargets: 100 },
          },
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 413 });
    });

    it("includes never-checked targets in the summary and explicit resolution projection", async () => {
      const emptyKeyword = await fixture.db.keyword.create({
        data: {
          createdAt: new Date("2026-01-01T00:00:00Z"),
          location: "Krakow",
          locationId: "report-location",
          projectId: fixture.project.id,
          publicId: makePublicId("kw"),
          text: "Never checked",
        },
      });
      const page = await readRankReportFor(
        fixture.context,
        {
          ...request(),
          resolutionIds: [emptyKeyword.publicId],
          selectedIds: [fixture.keyword.publicId, emptyKeyword.publicId],
        },
        rankReportTestOptions(),
        fixture.db,
      );
      expect(page.summary.metric.counts).toMatchObject({ expected: 2, neverChecked: 1, ranked: 1 });
      expect(page.totalCount).toBe(101);
      expect(page.resolutions).toMatchObject([
        {
          baseline: null,
          comparison: "unavailable",
          current: null,
          keywordId: emptyKeyword.publicId,
          latestAttempt: null,
          movement: null,
        },
      ]);
    });

    it("refuses state updated after a historical watermark instead of reconstructing it", async () => {
      const id = fixture.checkIds[0];
      if (!id) throw new Error("Missing retained check fixture");
      await fixture.db.rankCheck.update({
        data: { updatedAt: new Date(reportAsOf.getTime() + 1000) },
        where: { id },
      });
      await expect(
        readRankReportFor(fixture.context, request(), rankReportTestOptions(), fixture.db),
      ).rejects.toMatchObject({ status: 409 });
    });
  },
);
