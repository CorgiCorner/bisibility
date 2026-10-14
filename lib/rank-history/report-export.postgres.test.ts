import { makePublicId } from "@/lib/db/public-id";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { selectRankTrackerReportKeywords } from "@/lib/queries/rank-tracker-report-selection";
import { createReportCursorCodec } from "@/lib/rank-reports/cursor";
import { rankReportTestDatabase } from "@/lib/rank-reports/postgres-test-fixture";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { HistoryExportAuthority } from "./export-authority";
import { historyExportReportOptions } from "./export-host";
import { loadHistoryExportSnapshot } from "./export-snapshot";
import { prepareRankHistoryExport } from "./report-export-service";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn(async () => ({})) }));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "full-schema actual history export",
  () => {
    let f: Awaited<ReturnType<typeof rankReportTestDatabase>>;
    let at: Date;
    const codec = createReportCursorCodec("owned-export-integration-key-not-a-secret");
    beforeAll(async () => {
      f = await rankReportTestDatabase(501);
      at = new Date();
    }, 120000);
    afterAll(async () => {
      await f?.close();
    });
    const options = () => ({
      codec,
      firstAsOf: at,
      db: f.db,
      reportAt: (date: Date) => historyExportReportOptions(f.context, date),
    });
    const input = { version: "2", range: "all", limit: 200 };
    it("returns all 501 observations through stable pages with whole-scope counts and zero provider calls", async () => {
      const fetch = vi.spyOn(globalThis, "fetch");
      const sideEffects = async () => ({
        schedules: (
          await f.client.query(
            `SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id), '[]'::jsonb) AS rows FROM keyword_schedules s`,
          )
        ).rows,
        meter: (
          await f.client.query(
            `SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY to_jsonb(m)::text), '[]'::jsonb) AS rows FROM metering_operation m`,
          )
        ).rows,
      });
      const before = await sideEffects();
      try {
        const ids: string[] = [];
        let cursor: string | undefined;
        let firstSummary: unknown;
        do {
          const page = await prepareRankHistoryExport(
            f.context,
            { ...input, cursor },
            f.project.publicId,
            options(),
          );
          if (!firstSummary) firstSummary = page.meta.summary;
          expect(page.meta.totalCount).toBe(501);
          expect(page.meta.summary).toEqual(firstSummary);
          expect(page.meta.asOf).toBe(at.toISOString());
          ids.push(...page.reportPage.map((row) => row.id));
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        expect(ids).toHaveLength(501);
        expect(new Set(ids).size).toBe(501);
        expect(fetch).not.toHaveBeenCalled();
        expect(await sideEffects()).toEqual(before);
      } finally {
        fetch.mockRestore();
      }
    });
    it("uses exactly the current list's full query selection and shared summary inside export", async () => {
      const report = historyExportReportOptions(f.context, at);
      const query = { ...defaultRankTrackerQueryState, search: "Service", pageSize: 25 as const };
      const selected = await selectRankTrackerReportKeywords(
        f.context,
        { projectRef: f.project.publicId, query },
        { ...report, db: f.db },
      );
      const snapshot = await loadHistoryExportSnapshot(
        f.context,
        { projectId: f.project.publicId, query },
        report,
        f.db,
      );
      expect(snapshot.targets.map(({ id }) => id).sort()).toEqual(selected.selectedKeywordIds);
      expect(snapshot.summary).toEqual(selected.report);
    });
    it("refuses capacity and foreign IDs without returning a partial success", async () => {
      const small = options();
      await expect(
        prepareRankHistoryExport(f.context, input, f.project.publicId, {
          ...small,
          reportAt: (date) => ({
            ...small.reportAt(date),
            limits: { maxChecks: 500, maxTargets: 1000, maxItems: 1000 },
          }),
        }),
      ).rejects.toMatchObject({ status: 413 });
      await expect(
        prepareRankHistoryExport(
          f.context,
          { ...input, keywordIds: [makePublicId("kw")] },
          f.project.publicId,
          options(),
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("keeps late-arriving old observations outside the recorded watermark", async () => {
      const first = await prepareRankHistoryExport(f.context, input, f.project.publicId, options());
      const late = await f.db.rankCheck.create({
        data: {
          publicId: makePublicId("check"),
          keywordId: f.keyword.id,
          checkedAt: new Date("2026-01-01T00:00:00Z"),
          createdAt: new Date(at.getTime() + 1000),
          updatedAt: new Date(at.getTime() + 1000),
          status: "completed",
          provider: "synthetic",
          position: 1,
        },
      });
      try {
        const next = await prepareRankHistoryExport(
          f.context,
          { ...input, cursor: first.nextCursor },
          f.project.publicId,
          options(),
        );
        expect(next.meta.totalCount).toBe(501);
        expect(next.meta.summary).toEqual(first.meta.summary);
      } finally {
        await f.db.rankCheck.delete({ where: { id: late.id } });
      }
    });
    it("rejects a changed historical row after the first page", async () => {
      const first = await prepareRankHistoryExport(f.context, input, f.project.publicId, options());
      const id = f.checkIds[0];
      if (!id) throw new Error("No check fixture");
      const old = await f.db.rankCheck.findUniqueOrThrow({
        where: { id },
        select: { rankingUrl: true, updatedAt: true },
      });
      await f.db.rankCheck.update({
        where: { id },
        data: {
          rankingUrl: "https://example.test/changed",
          updatedAt: new Date(at.getTime() + 1000),
        },
      });
      try {
        await expect(
          prepareRankHistoryExport(
            f.context,
            { ...input, cursor: first.nextCursor },
            f.project.publicId,
            options(),
          ),
        ).rejects.toMatchObject({ status: 409 });
      } finally {
        await f.db.rankCheck.update({ where: { id }, data: old });
      }
    });
    it("reauthorizes a revoked reader before serving the next page", async () => {
      const first = await prepareRankHistoryExport(f.context, input, f.project.publicId, options());
      const member = await f.db.membership.findFirstOrThrow({
        where: { projectId: f.project.id, userId: f.context.actor.id },
      });
      await f.db.membership.delete({ where: { id: member.id } });
      try {
        await expect(
          prepareRankHistoryExport(
            f.context,
            { ...input, cursor: first.nextCursor },
            f.project.publicId,
            options(),
          ),
        ).rejects.toThrow();
      } finally {
        await f.db.membership.create({ data: member });
      }
    });
    it("uses an actual read-only project credential, then refuses revocation without a User impersonation", async () => {
      const key = await f.db.apiKey.create({
        data: {
          publicId: makePublicId("key"),
          projectId: f.project.id,
          name: "Owned read fixture",
          prefix: "owned_read_fixture",
          hashedKey: "synthetic-hash-only",
          scopes: ["read"],
        },
      });
      const context: HistoryExportAuthority = {
        actor: { id: key.id, memberships: [{ projectId: f.project.id, role: "admin" }] },
        transport: "project_key",
        credentialId: key.id,
        credential: { kind: "project_key", id: key.id },
      };
      const opts = {
        ...options(),
        reportAt: (date: Date) => historyExportReportOptions(context, date),
      };
      try {
        const first = await prepareRankHistoryExport(context, input, f.project.publicId, opts);
        expect(first.meta.totalCount).toBe(501);
        await f.db.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date() } });
        await expect(
          prepareRankHistoryExport(
            context,
            { ...input, cursor: first.nextCursor },
            f.project.publicId,
            opts,
          ),
        ).rejects.toThrow();
      } finally {
        await f.db.apiKey.delete({ where: { id: key.id } });
      }
    });
  },
);
