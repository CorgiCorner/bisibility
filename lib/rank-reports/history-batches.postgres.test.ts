import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  rankReportTestDatabase,
  rankReportTestOptions,
  rankReportTestRequest,
} from "./postgres-test-fixture";
import { readRankReportFor } from "./service";

vi.mock("server-only", () => ({}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "retained history across database batches",
  () => {
    let f: Awaited<ReturnType<typeof rankReportTestDatabase>>;
    beforeAll(async () => {
      f = await rankReportTestDatabase(601);
    }, 120_000);
    afterAll(async () => {
      await f?.close();
    });
    it("keeps all history, stable totals and unique public observations across report pages", async () => {
      const request = { ...rankReportTestRequest(f.project, f.keyword), pageLimit: 250 };
      const first = await readRankReportFor(f.context, request, rankReportTestOptions(), f.db);
      expect(first.totalCount).toBe(601);
      expect(first.summary.metric.counts.expected).toBe(1);
      expect(first.summary.metric.value).toBeCloseTo(50, 9);
      const ids = first.records.map(({ id }) => id);
      let cursor = first.nextCursor;
      while (cursor) {
        const page = await readRankReportFor(
          f.context,
          { ...request, cursor },
          rankReportTestOptions(),
          f.db,
        );
        expect(page.summary).toEqual(first.summary);
        expect(page.totalCount).toBe(601);
        ids.push(...page.records.map(({ id }) => id));
        cursor = page.nextCursor;
      }
      expect(ids).toHaveLength(601);
      expect(new Set(ids).size).toBe(601);
    }, 120_000);
  },
);
