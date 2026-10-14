import { randomUUID } from "node:crypto";
import { assignBusinessLocationFor } from "@/lib/business-location-store/assignment-write";
import { setBusinessLocationStateFor } from "@/lib/business-location-store/location-write";
import {
  type BusinessPgFixture,
  businessLocationDatabase,
  seedBusinessProject,
} from "@/lib/business-location-store/postgres.test-fixture";
import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import {
  readDashboardPreferenceFor,
  saveDashboardLayoutFor,
  saveDashboardLocalSelectionFor,
} from "@/lib/project-surface-preferences/dashboard-store";
import { sessionSavedViewContext } from "@/lib/saved-views/context";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDashboardLocalContext } from "./context";
import { localDashboardFixture } from "./postgres.test-fixture";
import { readLocalReportInTransaction } from "./read";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "Local dashboard real read-only and personal preference contract",
  () => {
    let db: BusinessPgFixture;
    let fixture: Awaited<ReturnType<typeof localDashboardFixture>>;
    beforeAll(async () => {
      db = await businessLocationDatabase();
    }, 120000);
    afterAll(async () => {
      await db?.close();
    });
    beforeEach(async () => {
      fixture = await localDashboardFixture(db);
    });
    const context = () => ({ actor: fixture.ownerContext.actor });
    const load = (selection = fixture.selection) =>
      loadDashboardLocalContext(
        fixture.project.publicId,
        context(),
        JSON.stringify(selection),
        null,
        new Date(),
        db.db,
      );
    const save = (
      revision: number,
      selection: typeof fixture.selection | null = fixture.selection,
    ) =>
      saveDashboardLocalSelectionFor(
        { projectId: fixture.project.publicId, expectedRevision: revision, selection },
        fixture.viewer,
        db.db,
      );

    it("viewer chooses only an explicit active subject without provider or schedule I/O", async () => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Local dashboard must not call HTTP"));
      try {
        const before = await db.db.checkSchedule.count();
        expect(await load()).toMatchObject({ state: "ready", selection: fixture.selection });
        const missing = await loadDashboardLocalContext(
          fixture.project.publicId,
          context(),
          undefined,
          null,
          new Date(),
          db.db,
        );
        expect(missing.state).toBe("missing");
        expect(missing.selection).toBeNull();
        expect(missing.choices).toHaveLength(1);
        expect(fetch).not.toHaveBeenCalled();
        expect(await db.db.checkSchedule.count()).toBe(before);
      } finally {
        fetch.mockRestore();
      }
    });
    it("real READ ONLY report retains legacy unknown and never invents current definition or match", async () => {
      const result = await db.db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          return readLocalReportInTransaction(
            tx,
            fixture.project.publicId,
            context(),
            fixture.selection,
            { device: "all", range: "28d", marketIds: [], tag: null },
            fixture.reportOptions(),
          );
        },
        { isolationLevel: "RepeatableRead" },
      );
      expect(result.expected).toBe(1);
      expect(result.retainedChecks).toBe(1);
      expect(result.targetTop3.value).toBeNull();
      expect(result.rows[0].target.current?.reason).toBe("current_scope_unavailable");
      expect(
        await db.db.businessMatchDecision.count({ where: { projectId: fixture.project.id } }),
      ).toBe(0);
    });
    it("own CAS persists across devices; saving layout preserves selection and clearing keeps General default", async () => {
      expect(await save(0)).toMatchObject({
        revision: 1,
        defaultPreset: "general",
        presentation: { localSelection: fixture.selection },
      });
      await expect(save(0, null)).rejects.toMatchObject({ status: 409 });
      await saveDashboardLayoutFor(
        {
          projectId: fixture.project.publicId,
          expectedRevision: 1,
          layout: presetDashboardLayout("local"),
        },
        fixture.viewer,
        db.db,
      );
      expect(
        await readDashboardPreferenceFor(fixture.viewer, fixture.project.publicId, db.db),
      ).toMatchObject({ revision: 2, presentation: { localSelection: fixture.selection } });
      expect(await save(2, null)).toMatchObject({
        revision: 3,
        defaultPreset: "general",
        presentation: { localSelection: null },
      });
      expect(
        await readDashboardPreferenceFor(
          sessionSavedViewContext(fixture.writerContext.actor!),
          fixture.project.publicId,
          db.db,
        ),
      ).toMatchObject({ revision: 0 });
    });
    it("stale/archived selection is neutral and never readopts a retained default", async () => {
      await save(0);
      await setBusinessLocationStateFor(
        {
          projectId: fixture.project.publicId,
          locationId: fixture.location.publicId,
          expectedVersion: fixture.location.version,
          state: "archived",
          idempotencyKey: randomUUID(),
        },
        fixture.writerContext,
        db.db,
      );
      expect(await load()).toMatchObject({ state: "unavailable", selection: null, choices: [] });
      await expect(save(1)).rejects.toMatchObject({ status: 409 });
      expect(
        (await readDashboardPreferenceFor(fixture.viewer, fixture.project.publicId, db.db))
          .revision,
      ).toBe(1);
    });
    it("assignment revision conflict and explicit unassignment do not change preference or identity history", async () => {
      await save(0);
      await assignBusinessLocationFor(
        {
          projectId: fixture.project.publicId,
          scope: fixture.selection.scope,
          target: null,
          expectedRevision: 1,
          reason: "Explicit clear",
          idempotencyKey: randomUUID(),
        },
        fixture.writerContext,
        db.db,
      );
      expect(await load()).toMatchObject({ state: "unavailable", selection: null });
      await expect(save(1)).rejects.toThrow();
      expect(
        await db.db.businessAssignmentRevision.count({ where: { projectId: fixture.project.id } }),
      ).toBe(2);
    });
    it("rejects forged owner, project API transport, foreign project and revoked membership", async () => {
      await expect(
        saveDashboardLocalSelectionFor(
          {
            projectId: fixture.project.publicId,
            expectedRevision: 0,
            selection: fixture.selection,
            userId: fixture.writer.id,
          },
          fixture.viewer,
          db.db,
        ),
      ).rejects.toThrow();
      await expect(
        saveDashboardLocalSelectionFor(
          { projectId: fixture.project.publicId, expectedRevision: 0, selection: null },
          {
            actor: fixture.ownerContext.actor!,
            auditActorId: fixture.owner.id,
            transport: "project_api",
          },
          db.db,
        ),
      ).rejects.toMatchObject({ code: "forbidden" });
      const foreign = await seedBusinessProject(db);
      await expect(
        loadDashboardLocalContext(
          foreign.project.publicId,
          context(),
          undefined,
          null,
          new Date(),
          db.db,
        ),
      ).rejects.toMatchObject({ code: "forbidden" });
      await db.db.membership.delete({
        where: { userId_projectId: { userId: fixture.owner.id, projectId: fixture.project.id } },
      });
      await expect(load()).rejects.toMatchObject({ code: "forbidden" });
      await expect(save(0)).rejects.toMatchObject({ code: "forbidden" });
    });
  },
);
