import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import {
  cleanRecoveryFixtures,
  recoveryFixture,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { afterAll, describe, expect, it } from "vitest";
import { readCheckSummaryDetails } from "./details";

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "UI-5 recipient-only persisted details",
  () => {
    afterAll(async () => {
      await cleanRecoveryFixtures();
      await prisma.$disconnect();
    });
    it("returns no summary to another user and replays a later restored or deleted check", async () => {
      const f = await recoveryFixture({ completed: true });
      const ntf = await prisma.notification.create({
        data: {
          publicId: makePublicId("ntf"),
          projectId: f.project.id,
          userId: f.user.id,
          type: "scheduled_window_summary",
          title: "scheduled_window_summary",
          version: 4,
          payload: {
            kind: "scheduled",
            windowStart: "2026-10-23T06:00:00Z",
            windowEnd: "2026-10-23T07:00:00Z",
            runPublicId: null,
            entries: [
              {
                checkId: f.check.id,
                keywordPublicId: f.keyword.publicId,
                group: "failed",
                previous: 8,
                current: null,
              },
            ],
            linkedIncidentIds: [],
            linkTarget: {
              from: "2026-10-23T06:00:00Z",
              to: "2026-10-23T07:00:00Z",
              trigger: "scheduled",
            },
          },
          checkSummary: {
            create: { checkIds: [f.check.id], topN: 7, positionMove: 3, version: 4 },
          },
        },
      });
      expect(
        await readCheckSummaryDetails(f.project.id, f.project.publicId, "other-user", ntf.publicId),
      ).toBeNull();
      await prisma.rankCheck.update({
        where: { id: f.check.id },
        data: { position: 1, recoveryRestoredAt: f.now },
      });
      const details = await readCheckSummaryDetails(
        f.project.id,
        f.project.publicId,
        f.user.id,
        ntf.publicId,
      );
      expect(details).toMatchObject({
        version: 4,
        topN: 7,
        rows: [
          {
            checkId: f.check.id,
            group: "failed",
            previous: 8,
            current: null,
            projection: { result: "recovered" },
          },
        ],
      });
      await prisma.rankCheck.delete({ where: { id: f.check.id } });
      expect(
        (await readCheckSummaryDetails(f.project.id, f.project.publicId, f.user.id, ntf.publicId))
          ?.rows,
      ).toEqual([
        expect.objectContaining({
          checkId: f.check.id,
          group: "failed",
          available: false,
          previous: 8,
          current: null,
        }),
      ]);
    });
  },
);
