import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { projectKeywordDetailQuality } from "@/lib/keyword-detail/quality-projector";
import { readCurrentDefinitionsInTransaction } from "@/lib/measurement-definitions/reader";
import { rankTrackerQualityFixture } from "@/lib/queries/rank-tracker-report-test-fixture";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RankReportDatabase } from "./access";
import {
  rankReportTestDatabase,
  rankReportTestOptions,
  rankReportTestRequest,
} from "./postgres-test-fixture";
import { readRankReportPagesWithProjectionFor } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn(async () => ({})) }));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "keyword detail header/history actual read snapshot",
  () => {
    let f: Awaited<ReturnType<typeof rankReportTestDatabase>>;
    let asOf: Date;
    beforeAll(async () => {
      f = await rankReportTestDatabase(320);
      await f.db.rankCheck.update({
        where: { id: f.checkIds[0] },
        data: {
          position: 1,
          updatedAt: new Date("2026-10-12T10:01:00.000Z"),
        },
      });
      // Real current-definition capture must precede the snapshot, not be backdated to a static fixture clock.
      asOf = new Date();
    }, 180_000);
    afterAll(async () => {
      await f?.close();
    });

    function options() {
      return {
        ...rankReportTestOptions(),
        firstAsOf: asOf,
        loadMetadata: async (
          tx: Prisma.TransactionClient,
          scope: {
            project: { id: string; publicId: string };
            keywords: { id: string; publicId: string }[];
          },
          asOf: Date,
        ) => {
          const metadata = await readCurrentDefinitionsInTransaction(
            tx,
            f.context,
            scope.project.publicId,
            scope.keywords.map((keyword) => keyword.publicId),
            asOf,
            { cadenceIntervalMs: async () => null },
          );
          return new Map([...metadata].map(([id, value]) => [id, { ...value, volume: null }]));
        },
      };
    }
    const requests = () => {
      const original = rankReportTestRequest(f.project, f.keyword);
      const request = {
        ...original,
        pageLimit: 25,
        window: { ...original.window, to: asOf.toISOString() },
      };
      return [request, { ...request, stream: "attempts" }] as const;
    };

    it("binds a full retained Best/current header to both paginated streams in one READ ONLY RepeatableRead", async () => {
      let transactions = 0;
      const db = {
        $transaction: async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => {
          transactions++;
          return f.db.$transaction(
            async (tx) => {
              await tx.$executeRaw`SET TRANSACTION READ ONLY`;
              return callback(tx);
            },
            { isolationLevel: "RepeatableRead" },
          );
        },
      } as RankReportDatabase;
      const metadata = {
        ...rankTrackerQualityFixture().row,
        id: f.keyword.publicId,
        position: 99,
        bestPosition: 99,
      };
      const result = await readRankReportPagesWithProjectionFor(
        f.context,
        requests(),
        options(),
        (snapshot) =>
          projectKeywordDetailQuality(
            metadata,
            snapshot.targets,
            snapshot.policy,
            snapshot.project.id,
            snapshot.sourceDigest,
          ),
        db,
      );
      expect(transactions).toBe(1);
      expect(
        result.pages.map((page) => [
          page.asOf,
          page.sourceDigest,
          page.totalCount,
          page.records.length,
        ]),
      ).toEqual([
        [result.projection.quality.asOf, result.projection.quality.sourceDigest, 320, 25],
        [result.projection.quality.asOf, result.projection.quality.sourceDigest, 320, 25],
      ]);
      expect(result.projection.quality).toMatchObject({
        retainedChecks: 320,
        best: { position: 1, qualifyingCount: 320, definitionOrigin: "current_definition" },
        rankQuality: {
          currentScopeState: "verified",
          current: { evidence: "positive", position: 2 },
        },
      });
      expect(
        result.pages[0].records.some((record) => record.id === result.projection.quality.best?.id),
      ).toBe(false);
    }, 180_000);

    it("isolates projected objects so a mutated callback copy cannot change page policy or source", async () => {
      const result = await readRankReportPagesWithProjectionFor(
        f.context,
        requests(),
        options(),
        (snapshot) => {
          const original = {
            asOf: snapshot.policy.asOf.toISOString(),
            sourceDigest: snapshot.sourceDigest,
          };
          const check = snapshot.targets[0]?.checks[0];
          if (!check) throw new Error("Missing retained fixture check");
          check.position = 999;
          snapshot.policy.asOf.setUTCFullYear(2000);
          snapshot.sourceDigest = "mutated-copy";
          return original;
        },
        f.db,
      );
      for (const page of result.pages)
        expect({ asOf: page.asOf, sourceDigest: page.sourceDigest }).toEqual(result.projection);
      expect(
        result.pages[0].records.some((record) => "position" in record && record.position === 999),
      ).toBe(false);
    });

    it("refuses an asynchronous adapter instead of awaiting an arbitrary projection hook", async () => {
      const invalidHost: () => unknown = () => Promise.resolve("untrusted async result");
      await expect(
        readRankReportPagesWithProjectionFor(f.context, requests(), options(), invalidHost, f.db),
      ).rejects.toThrow("Report projection must be synchronous.");
    });

    it("refuses the real all-retained read budget before returning a partial Best or calling the projector", async () => {
      const project = vi.fn(() => "must not run");
      const policy = options();
      await expect(
        readRankReportPagesWithProjectionFor(
          f.context,
          requests(),
          { ...policy, limits: { ...policy.limits, maxChecks: 319 } },
          project,
          f.db,
        ),
      ).rejects.toMatchObject({ status: 413 });
      expect(project).not.toHaveBeenCalled();
    });

    it("renews membership before projecting and never projects a foreign target", async () => {
      const project = vi.fn(() => "must not run");
      const foreignProject = await f.db.project.create({
        data: {
          name: "Foreign fixture",
          domain: "foreign.test",
          ownerId: f.project.ownerId,
          publicId: makePublicId("prj"),
        },
      });
      const foreignKeyword = await f.db.keyword.create({
        data: {
          projectId: foreignProject.id,
          publicId: makePublicId("kw"),
          createdAt: new Date("2026-01-01T00:00:00Z"),
          text: "Foreign fixture",
          device: f.keyword.device,
          location: f.keyword.location,
          locationId: f.keyword.locationId,
        },
      });
      await expect(
        readRankReportPagesWithProjectionFor(
          f.context,
          requests().map((request) => ({ ...request, selectedIds: [foreignKeyword.publicId] })),
          options(),
          project,
          f.db,
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        readRankReportPagesWithProjectionFor(
          f.context,
          requests().map((request) => ({
            ...request,
            projectId: foreignProject.publicId,
            selectedIds: [foreignKeyword.publicId],
          })),
          options(),
          project,
          f.db,
        ),
      ).rejects.toThrow();
      expect(project).not.toHaveBeenCalled();
      await f.db.membership.deleteMany({
        where: { projectId: f.project.id, userId: f.context.actor.id },
      });
      await expect(
        readRankReportPagesWithProjectionFor(f.context, requests(), options(), project, f.db),
      ).rejects.toThrow();
      expect(project).not.toHaveBeenCalled();
    });
  },
);
