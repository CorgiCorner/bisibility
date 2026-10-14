import type { Actor } from "@/lib/auth/authorize";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { selectRankTrackerReportKeywords } from "@/lib/queries/rank-tracker-report-selection";
import { historyExportReportOptions } from "@/lib/rank-history/export-host";
import { rankReportTestDatabase } from "@/lib/rank-reports/postgres-test-fixture";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { exportKeywords } from "./keyword-export-action";

const runtime = vi.hoisted(() => ({
  database: vi.fn<() => PrismaClient>(),
  actor: vi.fn<() => Promise<Actor>>(),
  beforeSnapshot: vi.fn<() => Promise<void>>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => ["owned-export-action-cursor-key-not-a-secret"],
}));
vi.mock("@/lib/db/prisma", () => ({
  // Route the real singleton to the owned full-schema database; no SQL/auth/report mock.
  prisma: new Proxy(
    {},
    {
      get(_target, key) {
        const database = runtime.database();
        const value = Reflect.get(database, key, database);
        if (key === "$transaction" && typeof value === "function") {
          return async (...args: unknown[]) => {
            await runtime.beforeSnapshot();
            return Reflect.apply(value, database, args);
          };
        }
        return typeof value === "function" ? value.bind(database) : value;
      },
    },
  ),
}));
vi.mock("./_shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./_shared")>();
  return { ...actual, getActionActor: runtime.actor };
});

// Requires the maintained owned PostgreSQL/full-migration fixture. Never targets a live project.
describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "actual action current-query export snapshot",
  () => {
    let fixture: Awaited<ReturnType<typeof rankReportTestDatabase>>;
    beforeAll(async () => {
      fixture = await rankReportTestDatabase(1);
      runtime.database.mockReturnValue(fixture.db);
      runtime.actor.mockResolvedValue(fixture.context.actor);
      runtime.beforeSnapshot.mockResolvedValue(undefined);
    }, 120000);
    afterAll(async () => {
      await fixture?.close();
    });

    it("v1 and v2 both exclude a retained raw Top 10 rank without current definition evidence", async () => {
      const legacy = await fixture.db.keyword.create({
        data: {
          publicId: makePublicId("kw"),
          projectId: fixture.project.id,
          text: "Unproven legacy",
          device: "mobile",
          location: fixture.keyword.location,
          locationId: fixture.keyword.locationId,
        },
      });
      await fixture.db.rankCheck.create({
        data: {
          publicId: makePublicId("check"),
          keywordId: legacy.id,
          provider: "synthetic",
          status: "completed",
          position: 2,
          previousPosition: 8,
        },
      });
      const query = {
        ...defaultRankTrackerQueryState,
        search: "Unproven legacy",
        filters: { ...defaultRankTrackerQueryState.filters, position: ["top10" as const] },
      };
      const selected = await selectRankTrackerReportKeywords(
        fixture.context,
        { projectRef: fixture.project.publicId, query },
        { ...historyExportReportOptions(fixture.context), db: fixture.db },
      );
      expect(selected.selectedKeywordIds).toEqual([]);
      expect(
        await fixture.db.rankCheck.count({ where: { keywordId: legacy.id, position: 2 } }),
      ).toBe(1);
      const fetch = vi.spyOn(globalThis, "fetch");
      try {
        for (const historyVersion of [1, 2]) {
          runtime.beforeSnapshot.mockClear();
          const result = await exportKeywords({
            projectId: fixture.project.publicId,
            scope: "history",
            historyVersion,
            range: "all",
            format: "json",
            selection: { mode: "query", query },
          });
          expect(result.count).toBe(0);
          const body = JSON.parse(result.content);
          if (historyVersion === 1) expect(body.keywords).toEqual([]);
          else {
            expect(body.data).toEqual([]);
            expect(body.meta.summary.retainedHistory.targets).toBe(0);
          }
          expect(runtime.beforeSnapshot).toHaveBeenCalledTimes(1);
        }
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        fetch.mockRestore();
      }
    });

    it.each([1, 2])(
      "v%s selects after a controlled change between outer scope read and snapshot",
      async (historyVersion) => {
        const text = `Snapshot before ${historyVersion}`;
        const keyword = await fixture.db.keyword.create({
          data: {
            publicId: makePublicId("kw"),
            projectId: fixture.project.id,
            text,
            device: "mobile",
            location: fixture.keyword.location,
            locationId: fixture.keyword.locationId,
          },
        });
        await fixture.db.rankCheck.create({
          data: {
            publicId: makePublicId("check"),
            keywordId: keyword.id,
            provider: "synthetic",
            status: "completed",
            position: 2,
          },
        });
        const query = { ...defaultRankTrackerQueryState, search: text };
        const before = await selectRankTrackerReportKeywords(
          fixture.context,
          { projectRef: fixture.project.publicId, query },
          { ...historyExportReportOptions(fixture.context), db: fixture.db },
        );
        expect(before.selectedKeywordIds).toEqual([keyword.publicId]);
        let changes = 0;
        runtime.beforeSnapshot.mockImplementationOnce(async () => {
          // A separate committed writer after outer project authorization but before BEGIN.
          await fixture.db.keyword.update({
            where: { id: keyword.id },
            data: { text: `Snapshot after ${historyVersion}` },
          });
          changes += 1;
        });
        try {
          const result = await exportKeywords({
            projectId: fixture.project.publicId,
            scope: "history",
            historyVersion,
            range: "all",
            format: "json",
            selection: { mode: "query", query },
          });
          expect(changes).toBe(1);
          expect(result.count).toBe(0);
          const body = JSON.parse(result.content);
          expect(historyVersion === 1 ? body.keywords : body.data).toEqual([]);
          const audit = await fixture.db.auditLog.findFirstOrThrow({
            where: {
              action: "keyword.json_export",
              projectId: fixture.project.id,
            },
            orderBy: { createdAt: "desc" },
          });
          expect(audit.after).toMatchObject({ count: 0, scope: "history" });
        } finally {
          runtime.beforeSnapshot.mockResolvedValue(undefined);
        }
      },
    );
  },
);
