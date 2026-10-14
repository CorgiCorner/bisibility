import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { definitionDatabaseFixture } from "@/lib/measurement-definitions/postgres.test-fixture";
import { materializeRankRun } from "@/lib/rank-check/runs/launch-write";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signSettingsQuote } from "./quote-binding";
import { verifiedManualConsent } from "./reviewed-consent";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-manual-consent-key-012345")],
}));
// The admitted canonical writer is exercised here; finance admission stays in its unchanged caller.
vi.mock("@/lib/rank-check/runs/launch-preflight", () => ({
  quoteRankRunReservationForLaunch: async () => ({}),
  providerAllocationReservation: () => ({}),
  estimatedRunUsageQuantity: () => 0,
  runUsageEstimate: () => ({}),
}));
describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "canonical manual audit transaction",
  () => {
    let f: Awaited<ReturnType<typeof definitionDatabaseFixture>>;
    beforeEach(async () => {
      f = await definitionDatabaseFixture();
    }, 120000);
    afterEach(async () => f?.close());
    function consent() {
      const now = new Date(),
        binding = {
          projectId: f.project.project.id,
          actorId: f.project.writer.id,
          depth: 20 as const,
          providerId: "dataforseo",
          selection: { targetIds: [f.observation.keyword.publicId] },
          source: {
            sourceHash: "a".repeat(64),
            manual: {
              targetIds: [f.observation.keyword.publicId],
              estimates: [
                {
                  providerId: "dataforseo",
                  unit: "cents",
                  quantity: "1.0000",
                  unknownTargets: 0,
                  certainty: "estimate",
                },
              ],
            },
          },
        };
      return verifiedManualConsent(signSettingsQuote("manual", binding, now).token, binding, now);
    }
    async function write(proof: ReturnType<typeof consent>) {
      const publicId = makePublicId("rcr"),
        row = f.observation.keyword;
      return f.db.$transaction((tx) =>
        materializeRankRun(tx, {
          input: {
            project: { id: f.project.project.id, domain: "example.test", isSample: false },
            actorId: f.project.writer.id,
            origin: { source: "app" },
            trigger: "manual",
            previewToken: "not-an-admission-call",
            spec: { kind: "all", v: 1 },
          },
          currentConnection: { provider: "dataforseo" },
          estimate: {
            costCents: 1,
            targets: [{ keywordId: row.id, depth: 20, cost: 1 }],
          } as Parameters<typeof materializeRankRun>[1]["estimate"],
          executable: [{ id: row.id, text: row.text }] as Parameters<
            typeof materializeRankRun
          >[1]["executable"],
          resolved: { keywordIds: [row.id], selectionHash: "b".repeat(64) },
          now: new Date(),
          publicId,
          orchestrationWorkflowId: `synthetic-${randomUUID()}`,
          host: {},
          idempotencyKey: undefined,
          consent: proof,
        }),
      );
    }
    it("persists run/items and its existing safe consent audit together", async () => {
      const proof = consent(),
        before = await f.db.auditLog.count({
          where: { action: "rank_check_run.launch", projectId: f.project.project.id },
        });
      const run = await write(proof);
      expect(await f.db.rankCheckRunItem.count({ where: { runId: run.id } })).toBe(1);
      expect(
        await f.db.auditLog.count({
          where: { action: "rank_check_run.launch", projectId: f.project.project.id },
        }),
      ).toBe(before + 1);
      const audit = await f.db.auditLog.findFirstOrThrow({
        where: { action: "rank_check_run.launch", projectId: f.project.project.id },
      });
      expect(audit.actorId).toBe(f.project.writer.id);
      expect(audit.after).toMatchObject({
        targetCount: 1,
        consent: {
          confirmed: true,
          purpose: "manual",
          outcome: "measurement_queued",
          reviewedTargetCount: 1,
          nativeEstimates: [{ quantity: "1.0000" }],
        },
      });
      expect(JSON.stringify(audit.after)).not.toContain(f.observation.keyword.publicId);
    }, 120000);
    it("rolls back run/items/audit when server-only consent identity is copied", async () => {
      const proof = consent();
      const before = {
        runs: await f.db.rankCheckRun.count({ where: { projectId: f.project.project.id } }),
        items: await f.db.rankCheckRunItem.count(),
        audit: await f.db.auditLog.count(),
      };
      await expect(write({ ...proof })).rejects.toThrow("verified_manual_consent_required");
      expect(await f.db.rankCheckRun.count({ where: { projectId: f.project.project.id } })).toBe(
        before.runs,
      );
      expect(await f.db.rankCheckRunItem.count()).toBe(before.items);
      expect(await f.db.auditLog.count()).toBe(before.audit);
    }, 120000);
  },
);
