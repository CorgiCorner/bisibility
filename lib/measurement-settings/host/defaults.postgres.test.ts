import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-review-defaults-key-only-000")],
}));

import { previewDefaultsHost, saveDefaultsHost } from "./defaults";
import {
  confirmDefaults,
  defaultsForm,
  defaultsPatch,
  reviewedDefaultsFixture,
} from "./defaults.postgres.test-fixture";

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "real reviewed defaults authority and future intent",
  () => {
    let f: Awaited<ReturnType<typeof reviewedDefaultsFixture>>;
    beforeEach(async () => {
      f = await reviewedDefaultsFixture();
    }, 120000);
    afterEach(async () => {
      await f?.close();
      vi.unstubAllGlobals();
    });
    async function footprint() {
      return {
        locations: await f.db.location.count(),
        audits: await f.db.auditLog.count(),
        runs: await f.db.rankCheckRun.count(),
        receipts: await f.db.measurementSettingsMutation.count(),
        defaults: await f.db.projectDefaults.findUniqueOrThrow({
          where: { projectId: f.project.project.id },
        }),
        targets: await f.db.keyword.findMany({
          where: { projectId: f.project.project.id },
          orderBy: { id: "asc" },
        }),
        observations: await f.db.observationRun.findMany({
          where: { projectId: f.project.project.id },
          orderBy: { id: "asc" },
        }),
        project: await f.db.project.findUniqueOrThrow({ where: { id: f.project.project.id } }),
      };
    }
    it("preview does not configure policy or mutate; reviewed PATCH preserves market/depth and aliases", async () => {
      const http = vi.fn(() => {
        throw new Error("No paid/display I/O");
      });
      vi.stubGlobal("fetch", http);
      const ref = f.project.project.publicId,
        ctx = f.project.writerContext;
      const before = await footprint(),
        request = defaultsPatch(ref, {});
      const preview = await previewDefaultsHost(ctx, request, f.db);
      expect(preview.policyReady).toBe(false);
      expect(preview.draft.serpDepth).toBe(20);
      expect(preview.impact.existingTargetRetargets).toBe(0);
      expect(preview.impact.newTargets).toBe(0);
      expect(await footprint()).toEqual(before);
      const saved = await saveDefaultsHost(ctx, request, confirmDefaults(preview), f.db);
      expect(saved.value.serpDepth).toBe(20);
      expect(saved.value.serpStopOnMatch).toBe(false);
      expect(saved.market).toMatchObject({
        locationKey: "US",
        device: "desktop",
        source: "explicit",
      });
      for (const market of [
        { country: "Germany", device: "mobile" },
        { country: "de", device: "mobile" },
        { locationKey: "DE", device: "mobile" },
      ]) {
        const next = defaultsPatch(ref, market),
          quote = await previewDefaultsHost(ctx, next, f.db);
        const row = await saveDefaultsHost(ctx, next, confirmDefaults(quote), f.db);
        expect(row.value).toMatchObject({
          country: "Germany",
          locationKey: "DE",
          device: "mobile",
          serpDepth: 20,
        });
      }
      const after = await footprint();
      expect(after.targets).toEqual(before.targets);
      expect(after.observations).toEqual(before.observations);
      expect(after.runs).toBe(0);
      expect(after.project.measurementPolicyConfig).toBeNull();
      expect(http).not.toHaveBeenCalled();
    }, 120000);
    it("uses exact quote/source CAS and recovers the original same-issuer receipt after expiry", async () => {
      const ctx = f.project.writerContext,
        request = defaultsForm(f.project.project.publicId);
      const quote = await previewDefaultsHost(ctx, request, f.db),
        command = confirmDefaults(quote);
      await expect(
        saveDefaultsHost(f.project.ownerContext, request, command, f.db),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        saveDefaultsHost(
          ctx,
          { ...request, values: { ...request.values, serpStopOnMatch: true } },
          command,
          f.db,
        ),
      ).rejects.toMatchObject({ code: "mismatch" });
      const expired = new Date(Date.parse(quote.expiresAt) + 1);
      await expect(saveDefaultsHost(ctx, request, command, f.db, expired)).rejects.toMatchObject({
        code: "expired",
      });
      const saved = await saveDefaultsHost(ctx, request, command, f.db);
      const auditCount = await f.db.auditLog.count();
      expect(await saveDefaultsHost(ctx, request, command, f.db, expired)).toEqual(saved);
      expect(await f.db.auditLog.count()).toBe(auditCount);
      await expect(
        saveDefaultsHost(
          ctx,
          request,
          { ...command, idempotencyKey: "new-key-with-old-source" },
          f.db,
        ),
      ).rejects.toMatchObject({ code: "settings_conflict" });
      await expect(
        saveDefaultsHost(
          ctx,
          { ...request, values: { ...request.values, serpDepth: 100 } },
          command,
          f.db,
        ),
      ).rejects.toMatchObject({ code: "mutation_conflict" });
      await f.db.membership.updateMany({
        where: { userId: ctx.actor.id, projectId: f.project.project.id },
        data: { role: "viewer" },
      });
      await expect(saveDefaultsHost(ctx, request, command, f.db)).rejects.toMatchObject({
        code: "forbidden",
      });
      expect(await f.db.measurementSettingsMutation.count()).toBe(1);
    }, 120000);
    it("writes as a scoped project key despite viewer owner; revalidates revocation and forbids a User alias", async () => {
      const request = defaultsForm(f.project.project.publicId),
        ctx = f.keyContext;
      const quote = await previewDefaultsHost(ctx, request, f.db),
        command = confirmDefaults(quote);
      const saved = await saveDefaultsHost(ctx, request, command, f.db);
      expect(saved.value.serpDepth).toBe(50);
      const receipt = await f.db.measurementSettingsMutation.findFirstOrThrow();
      expect(receipt.actorId).toBeNull();
      const audit = await f.db.auditLog.findFirstOrThrow({
        where: { action: "settings.defaults.update" },
      });
      expect(audit.actorId).toBeNull();
      await expect(
        previewDefaultsHost({ ...ctx, actor: { id: f.project.owner.id } }, request, f.db),
      ).rejects.toMatchObject({ code: "forbidden" });
      await f.db.apiKey.update({ where: { id: f.key.id }, data: { revokedAt: new Date() } });
      await expect(saveDefaultsHost(ctx, request, command, f.db)).rejects.toMatchObject({
        code: "forbidden",
      });
      expect(await f.db.measurementSettingsMutation.count()).toBe(1);
      expect(await f.db.rankCheckRun.count()).toBe(0);
    }, 120000);
  },
);
