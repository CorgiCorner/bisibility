import { randomUUID } from "node:crypto";
import { AuthorizationError } from "@/lib/auth/authorize";
import { makePublicId } from "@/lib/db/public-id";
import { listSessionSavedViewsFor } from "@/lib/queries/saved-views";
import { type SavedViewContext, sessionSavedViewContext } from "@/lib/saved-views/context";
import { personalViewDatabase } from "@/lib/saved-views/postgres-test-fixture";
import {
  createSavedViewV2For,
  deleteSavedViewV2For,
  updateSavedViewV2For,
} from "@/lib/saved-views/v2-service";
import { keywordViewFixture } from "@/lib/saved-views/view-test-fixture";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { savePersonalPresentationFor } from "./service";
import { readPersonalSurfacePreferenceFor } from "./store";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "personal-view real authorization and display isolation",
  () => {
    let fixture: Awaited<ReturnType<typeof personalViewDatabase>>;
    let context: SavedViewContext;
    let project: { id: string; publicId: string };
    beforeAll(async () => {
      fixture = await personalViewDatabase();
    }, 60000);
    afterAll(async () => {
      await fixture?.close();
    });
    beforeEach(async () => {
      const suffix = randomUUID();
      const viewer = await fixture.db.user.create({
        data: { email: `${suffix}@viewer.test`, name: "Viewer", publicId: makePublicId("usr") },
      });
      const administrator = await fixture.db.user.create({
        data: { email: `${suffix}@admin.test`, name: "Admin", publicId: makePublicId("usr") },
      });
      project = await fixture.db.project.create({
        data: {
          domain: "example.test",
          name: "Project",
          ownerId: viewer.id,
          publicId: makePublicId("prj"),
        },
      });
      await fixture.db.membership.createMany({
        data: [
          {
            projectId: project.id,
            userId: viewer.id,
            role: "viewer",
            publicId: makePublicId("mbr"),
          },
          {
            projectId: project.id,
            userId: administrator.id,
            role: "admin",
            publicId: makePublicId("mbr"),
          },
        ],
      });
      // The service must refresh membership, rather than trusting this stale empty snapshot.
      context = sessionSavedViewContext({ id: viewer.id, memberships: [] });
    });
    function createInput(requestId = randomUUID()) {
      return {
        config: keywordViewFixture(),
        name: "Service mobile",
        projectId: project.publicId,
        requestId,
      };
    }
    const create = (input = createInput()) => createSavedViewV2For(input, context, fixture.db);
    const read = (ctx = context) =>
      readPersonalSurfacePreferenceFor(ctx, project.publicId, "keywords", fixture.db);

    it("rejects stale revisions without overwriting a newer view and denies revoked membership using current facts", async () => {
      const view = await create();
      const input = {
        config: keywordViewFixture(),
        expectedRevision: view.revision,
        name: "New name",
        projectId: project.publicId,
        viewId: view.id,
      };
      expect(await updateSavedViewV2For(input, context, fixture.db)).toMatchObject({
        name: "New name",
        revision: 2,
      });
      await expect(
        updateSavedViewV2For({ ...input, name: "Lost edit" }, context, fixture.db),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        deleteSavedViewV2For(
          { expectedRevision: 1, projectId: project.publicId, viewId: view.id },
          context,
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await fixture.db.membership.delete({
        where: { userId_projectId: { projectId: project.id, userId: context.actor.id } },
      });
      const staleContext = sessionSavedViewContext({
        ...context.actor,
        memberships: [{ projectId: project.id, role: "viewer" }],
      });
      await expect(
        listSessionSavedViewsFor(staleContext, project.publicId, "keywords", fixture.db),
      ).rejects.toThrow(AuthorizationError);
      await expect(read(staleContext)).rejects.toThrow(AuthorizationError);
      await expect(createSavedViewV2For(createInput(), staleContext, fixture.db)).rejects.toThrow(
        AuthorizationError,
      );
      expect(await fixture.db.savedView.findFirst({ where: { publicId: view.id } })).toMatchObject({
        name: "New name",
        revision: 2,
      });
    });

    it("performs twenty display changes without provider HTTP, measurements or schedule mutation", async () => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Display preferences must not call HTTP"));
      try {
        const before = {
          checks: await fixture.db.rankCheck.count(),
          schedules: await fixture.db.checkSchedule.findMany(),
        };
        let revision = 0;
        for (let index = 0; index < 20; index++) {
          const result = await savePersonalPresentationFor(
            {
              expectedRevision: revision,
              presentation: {
                ...keywordViewFixture().presentation,
                visibility: { volume: index % 2 === 0 },
              },
              projectId: project.publicId,
              surface: "keywords",
            },
            context,
            fixture.db,
          );
          revision = result.revision;
        }
        expect(revision).toBe(20);
        expect(fetch).not.toHaveBeenCalled();
        expect(await fixture.db.rankCheck.count()).toBe(before.checks);
        expect(await fixture.db.checkSchedule.findMany()).toEqual(before.schedules);
        const audits = await fixture.db.auditLog.findMany({ where: { projectId: project.id } });
        expect(audits).toHaveLength(20);
        expect(JSON.stringify(audits.map(({ after }) => after))).not.toContain("volume");
      } finally {
        fetch.mockRestore();
      }
    });
  },
);
