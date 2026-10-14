import { afterEach, describe, expect, it, vi } from "vitest";
import { previewDefaultsHost, saveDefaultsHost } from "./defaults";
import {
  confirmDefaults,
  defaultsForm,
  reviewedDefaultsFixture,
} from "./defaults.postgres.test-fixture";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-consent-key-012345678900")],
}));
describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "defaults actual reviewed consent audit",
  () => {
    let fixture: Awaited<ReturnType<typeof reviewedDefaultsFixture>>;
    afterEach(async () => fixture?.close());
    it("retains key principal consent and exact revision without raw token; replay has no new audit", async () => {
      fixture = await reviewedDefaultsFixture();
      const request = defaultsForm(fixture.project.project.publicId);
      const preview = await previewDefaultsHost(fixture.keyContext, request, fixture.db);
      const command = confirmDefaults(preview);
      await saveDefaultsHost(fixture.keyContext, request, command, fixture.db);
      const row = await fixture.db.auditLog.findFirstOrThrow({
        where: { projectId: fixture.project.project.id, action: "settings.defaults.update" },
      });
      expect(row.actorId).toBeNull();
      expect(row.after).toMatchObject({
        consent: {
          purpose: "defaults",
          confirmed: true,
          principalKind: "project_key",
          sourceDigest: preview.expectedSourceHash,
          policyRevision: preview.expectedRevision,
          impact: { inheritedDepthTargets: preview.impact.inheritedDepthTargets },
          nativeEstimates: null,
        },
      });
      expect(JSON.stringify(row.after)).not.toContain(preview.previewToken);
      const count = await fixture.db.auditLog.count();
      await saveDefaultsHost(fixture.keyContext, request, command, fixture.db);
      expect(await fixture.db.auditLog.count()).toBe(count);
      await expect(
        saveDefaultsHost(
          fixture.keyContext,
          request,
          { ...command, idempotencyKey: "synthetic-new-key-stale-review" },
          fixture.db,
        ),
      ).rejects.toMatchObject({ code: "settings_conflict" });
      expect(await fixture.db.auditLog.count()).toBe(count);
    }, 120000);
  },
);
