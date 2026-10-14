import { makePublicId } from "@/lib/db/public-id";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readRetainedHistorySnapshotFor } from "./history-snapshot";
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
  "saved check normalized snapshot",
  () => {
    let fixture: Awaited<ReturnType<typeof rankReportTestDatabase>>;
    beforeAll(async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-12T13:00:00Z"));
      fixture = await rankReportTestDatabase(3);
    }, 60000);
    afterAll(async () => {
      try {
        await fixture?.close();
      } finally {
        vi.useRealTimers();
      }
    });
    async function selected() {
      const page = await readRankReportFor(
        fixture.context,
        rankReportTestRequest(fixture.project, fixture.keyword),
        rankReportTestOptions(),
        fixture.db,
      );
      const observation = page.records.find((record) => "evidence" in record);
      if (!observation) throw new Error("Fixture observation missing.");
      return {
        page,
        observation,
        input: {
          projectId: fixture.project.publicId,
          keywordId: fixture.keyword.publicId,
          checkId: observation.id,
          asOf: page.asOf,
        },
      };
    }
    it("returns the exact clicked observation and historical URL without any raw payload", async () => {
      const { observation, input } = await selected();
      const snapshot = await readRetainedHistorySnapshotFor(
        fixture.context,
        input,
        rankReportTestOptions(),
        fixture.db,
      );
      expect(snapshot.observation).toEqual(observation);
      expect(snapshot.observation.rankingUrl).toMatch(/\/history-\d$/);
      expect(snapshot).not.toHaveProperty("raw");
      expect(
        snapshot.featureFacts?.every(
          (fact) => fact.presence === "unknown" && fact.ownership === "unknown",
        ),
      ).toBe(true);
    });
    it("retains normalized rank when raw is absent and does not fabricate an expired state", async () => {
      const { input } = await selected();
      const snapshot = await readRetainedHistorySnapshotFor(
        fixture.context,
        input,
        rankReportTestOptions(),
        fixture.db,
      );
      expect(snapshot).toMatchObject({
        detailState: "not_stored",
        observation: { position: 2 },
        items: [],
      });
    });
    it("rejects foreign selected target and check IDs", async () => {
      const { input } = await selected();
      await expect(
        readRetainedHistorySnapshotFor(
          fixture.context,
          { ...input, keywordId: makePublicId("kw") },
          rankReportTestOptions(),
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        readRetainedHistorySnapshotFor(
          fixture.context,
          { ...input, checkId: makePublicId("check") },
          rankReportTestOptions(),
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("rejects evidence updated after the clicked watermark", async () => {
      const { input } = await selected();
      await fixture.db.rankCheck.update({
        where: { publicId: input.checkId },
        data: {
          rankingUrl: "https://example.test/changed",
          updatedAt: new Date(reportAsOf.getTime() + 1000),
        },
      });
      await expect(
        readRetainedHistorySnapshotFor(fixture.context, input, rankReportTestOptions(), fixture.db),
      ).rejects.toMatchObject({ status: 409 });
    });
  },
);
