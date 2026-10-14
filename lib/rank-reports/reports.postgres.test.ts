import type { Prisma } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RankReportContext, RankReportDatabase } from "./access";
import {
  rankReportTestDatabase,
  rankReportTestOptions,
  rankReportTestRequest,
} from "./postgres-test-fixture";
import { reportAsOf } from "./report-test-fixture";
import { readRankReportFor, readRankReportPagesFor } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn(async () => ({})) }));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "rank report real stable history cursor",
  () => {
    let fixture: Awaited<ReturnType<typeof rankReportTestDatabase>>;
    let context: RankReportContext;
    let project: { id: string; publicId: string };
    let keyword: { id: string; publicId: string };
    let checkIds: string[];
    beforeAll(async () => {
      fixture = await rankReportTestDatabase();
      ({ context, project, keyword, checkIds } = fixture);
    }, 60000);
    afterAll(async () => {
      await fixture?.close();
    });
    const options = rankReportTestOptions;
    const request = () => rankReportTestRequest(project, keyword);

    it("reads observation and attempt pages in one genuinely read-only snapshot", async () => {
      let transactions = 0;
      const readOnlyDb = {
        $transaction: async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => {
          transactions++;
          return fixture.db.$transaction(
            async (tx) => {
              await tx.$executeRaw`SET TRANSACTION READ ONLY`;
              return callback(tx);
            },
            { isolationLevel: "RepeatableRead" },
          );
        },
      } as RankReportDatabase;
      const pages = await readRankReportPagesFor(
        context,
        [request(), { ...request(), stream: "attempts" }],
        options(),
        readOnlyDb,
      );
      expect(transactions).toBe(1);
      expect(pages.map(({ stream }) => stream)).toEqual(["observations", "attempts"]);
      expect(pages[0].sourceDigest).toBe(pages[1].sourceDigest);
      expect(pages[0].summary).toEqual(pages[1].summary);
      expect(pages[0].asOf).toBe(pages[1].asOf);
      expect(pages[0].totalCount).toBe(101);
      expect(pages[1].totalCount).toBe(101);
    });

    it("reads all 101 observations across a frozen cursor and keeps whole-scope totals independent of page size", async () => {
      const first = await readRankReportFor(context, request(), options(), fixture.db);
      expect(first.summary.metric.counts.expected).toBe(1);
      expect(first.summary.metric.value).toBeCloseTo(50, 9);
      expect(first.totalCount).toBe(101);
      const ids = first.records.map(({ id }) => id);
      let cursor = first.nextCursor;
      while (cursor) {
        const next = await readRankReportFor(
          context,
          { ...request(), cursor, pageLimit: 50 },
          { ...options(), firstAsOf: new Date("2027-01-01T00:00:00Z") },
          fixture.db,
        );
        expect(next.asOf).toBe(reportAsOf.toISOString());
        expect(next.summary).toEqual(first.summary);
        ids.push(...next.records.map(({ id }) => id));
        cursor = next.nextCursor;
      }
      expect(new Set(ids).size).toBe(101);
      const empty = await readRankReportFor(
        context,
        { ...request(), selectedIds: [] },
        options(),
        fixture.db,
      );
      expect(empty).toMatchObject({
        records: [],
        summary: { metric: { counts: { expected: 0 }, value: null } },
        totalCount: 0,
      });
    });

    it("rejects normalized history mutation even if updatedAt is backdated under the watermark", async () => {
      const first = await readRankReportFor(context, request(), options(), fixture.db);
      expect(first.nextCursor).not.toBeNull();
      const id = checkIds[0];
      if (!id) throw new Error("Missing report check fixture");
      await fixture.db.rankCheck.update({
        data: {
          rankingUrl: "https://example.test/changed-history",
          updatedAt: new Date("2026-10-12T10:03:00Z"),
        },
        where: { id },
      });
      await expect(
        readRankReportFor(
          context,
          { ...request(), cursor: first.nextCursor },
          options(),
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
  },
);
