import {
  type BusinessPgFixture,
  businessLocationDatabase,
} from "@/lib/business-location-store/postgres.test-fixture";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareRetainedEvidenceRematch, replayRetainedEvidenceRematch } from "./rematch";
import { seedBoundRematch } from "./rematch.postgres.test-fixture";
import { codeHash } from "./test-fixture";

describe.runIf(Boolean(process.env.PROVIDER_UI_TEST_DATABASE_URL))(
  "owned actual retained original binding rematch",
  () => {
    let fixture: BusinessPgFixture;
    beforeAll(async () => {
      fixture = await businessLocationDatabase();
    }, 120000);
    afterAll(async () => {
      await fixture?.close();
    }, 30000);
    it("appends source-version provenance with original time/slot, explicit rematch cannot become original automatic KPI", async () => {
      const value = await seedBoundRematch(fixture);
      const prepared = await prepareRetainedEvidenceRematch(
        value.command,
        value.context,
        codeHash,
        fixture.db,
      );
      expect(
        await fixture.db.businessMatchDecision.count({ where: { observationRunId: value.run.id } }),
      ).toBe(0);
      const first = await replayRetainedEvidenceRematch(
        value.command,
        prepared,
        value.context,
        codeHash,
        fixture.db,
      );
      expect(first.replayed).toBe(false);
      const replay = await replayRetainedEvidenceRematch(
        value.command,
        prepared,
        value.context,
        codeHash,
        fixture.db,
      );
      expect(replay.replayed).toBe(true);
      const decision = await fixture.db.businessMatchDecision.findFirstOrThrow({
        where: { observationRunId: value.run.id },
      });
      expect(decision).toMatchObject({
        source: "rematch",
        decisionRevision: 1,
        status: "confirmed",
        matchedBy: "stable_id",
        observedAt: value.item.observedAt,
      });
      expect(decision.evidence).toMatchObject({
        originalOrdinals: { slot: 3, page: 1 },
        replay: prepared,
      });
      expect(
        await fixture.db.businessMatchDecision.count({
          where: { observationRunId: value.run.id, decisionRevision: 1, source: "automatic" },
        }),
      ).toBe(0);
      expect(
        await fixture.db.observationRun.count({ where: { rankCheckId: value.run.rankCheckId } }),
      ).toBe(1);
    });
    it("fresh revocation refuses prior receipt without additional decisions", async () => {
      const value = await seedBoundRematch(fixture);
      const prepared = await prepareRetainedEvidenceRematch(
        value.command,
        value.context,
        codeHash,
        fixture.db,
      );
      await replayRetainedEvidenceRematch(
        value.command,
        prepared,
        value.context,
        codeHash,
        fixture.db,
      );
      await fixture.db.membership.deleteMany({
        where: { projectId: value.project.id, userId: value.writer.id },
      });
      await expect(
        replayRetainedEvidenceRematch(value.command, prepared, value.context, codeHash, fixture.db),
      ).rejects.toThrow();
      expect(
        await fixture.db.businessMatchDecision.count({ where: { observationRunId: value.run.id } }),
      ).toBe(1);
    });
  },
);
