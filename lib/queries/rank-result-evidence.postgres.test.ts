import { prisma } from "@/lib/db/prisma";
import {
  cleanRecoveryFixtures,
  recoveryFixture,
} from "@/lib/provider-evidence/recovery/postgres.test-support";
import { afterAll, describe, expect, it } from "vitest";
import { readRankResultEvidence } from "./rank-result-evidence";

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "UI-6 scoped rank markers PostgreSQL",
  () => {
    afterAll(async () => {
      await cleanRecoveryFixtures();
      await prisma.$disconnect();
    });
    it("uses the canonical projection with original check time, actual depth, position and unknown cost", async () => {
      const f = await recoveryFixture({ completed: true });
      await prisma.rankCheck.update({
        where: { id: f.check.id },
        data: { recoveryRestoredAt: f.now, recoveryProvenance: { operationPk: f.operationPk } },
      });
      await prisma.providerOperationEvidence.create({
        data: {
          operationPk: f.operationPk,
          acceptance: "accepted",
          fulfillment: "complete",
          returnedDepth: 20,
          accounting: "unknown",
          exhaustionStatus: "exhausted",
          exhaustionReason: "history_exhausted",
          recoveryState: "resolved",
        },
      });
      const result = await prisma.$transaction((tx) =>
        readRankResultEvidence(tx, f.project.id, [f.check.publicId]),
      );
      expect(result.get(f.check.publicId)).toMatchObject({
        position: 7,
        projection: {
          result: "recovered",
          cost: "unknown",
          originalCheckedAt: f.check.checkedAt.toISOString(),
          returnedDepth: 20,
        },
      });
      expect(
        await prisma.$transaction((tx) =>
          readRankResultEvidence(tx, "foreign-project", [f.check.publicId]),
        ),
      ).toEqual(new Map());
      await prisma.rankCheck.update({
        where: { id: f.check.id },
        data: { status: "failed", recoveryRestoredAt: null, position: null },
      });
      await prisma.providerOperationEvidence.update({
        where: { operationPk: f.operationPk },
        data: { fulfillment: "partial" },
      });
      expect(
        (
          await prisma.$transaction((tx) =>
            readRankResultEvidence(tx, f.project.id, [f.check.publicId]),
          )
        ).get(f.check.publicId),
      ).toMatchObject({ position: null, projection: { result: "partial", returnedDepth: 20 } });
    });
  },
);
