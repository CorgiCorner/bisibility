import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id";
import { getSessionSavedViewFor, listSessionSavedViewsFor } from "@/lib/queries/saved-views";
import { type SavedViewContext, sessionSavedViewContext } from "@/lib/saved-views/context";
import { personalViewDatabase } from "@/lib/saved-views/postgres-test-fixture";
import { createSavedViewV2For, deleteSavedViewV2For } from "@/lib/saved-views/v2-service";
import { keywordViewFixture } from "@/lib/saved-views/view-test-fixture";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setPersonalDefaultFor } from "./service";
import { readPersonalSurfacePreferenceFor } from "./store";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "personal-view real retry, revision and lifecycle",
  () => {
    let fixture: Awaited<ReturnType<typeof personalViewDatabase>>;
    let context: SavedViewContext;
    let admin: SavedViewContext;
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
      admin = sessionSavedViewContext({ id: administrator.id, memberships: [] });
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

    it("allows viewer personal writes, isolates an admin's defaults and refuses project-key personal transport", async () => {
      const view = await create();
      const saved = await setPersonalDefaultFor(
        {
          expectedRevision: 0,
          projectId: project.publicId,
          surface: "keywords",
          target: { kind: "saved_view", viewId: view.id },
        },
        context,
        fixture.db,
      );
      expect(saved).toMatchObject({ revision: 1, defaultTarget: { viewId: view.id } });
      expect(await read(admin)).toMatchObject({
        revision: 0,
        defaultTarget: { kind: "preset", presetId: "general" },
      });
      expect(
        await listSessionSavedViewsFor(admin, project.publicId, "keywords", fixture.db),
      ).toEqual([]);
      expect(
        await getSessionSavedViewFor(admin, project.publicId, view.id, "keywords", fixture.db),
      ).toBeNull();
      await expect(
        setPersonalDefaultFor(
          {
            expectedRevision: 0,
            projectId: project.publicId,
            surface: "keywords",
            target: { kind: "saved_view", viewId: view.id },
          },
          admin,
          fixture.db,
        ),
      ).rejects.toThrow("unavailable");
      await expect(
        setPersonalDefaultFor(
          {
            expectedRevision: 0,
            projectId: project.publicId,
            surface: "competitors",
            target: { kind: "saved_view", viewId: view.id },
          },
          context,
          fixture.db,
        ),
      ).rejects.toThrow("unavailable");
      const foreignProject = await fixture.db.project.create({
        data: {
          domain: "foreign.test",
          name: "Foreign",
          ownerId: context.actor.id,
          publicId: makePublicId("prj"),
        },
      });
      await fixture.db.membership.create({
        data: {
          projectId: foreignProject.id,
          userId: context.actor.id,
          role: "viewer",
          publicId: makePublicId("mbr"),
        },
      });
      await expect(
        setPersonalDefaultFor(
          {
            expectedRevision: 0,
            projectId: foreignProject.publicId,
            surface: "keywords",
            target: { kind: "saved_view", viewId: view.id },
          },
          context,
          fixture.db,
        ),
      ).rejects.toThrow("unavailable");
      const projectKey = { actor: context.actor, auditActorId: context.actor.id };
      await expect(createSavedViewV2For(createInput(), projectKey, fixture.db)).rejects.toThrow();
      await expect(
        readPersonalSurfacePreferenceFor(projectKey, project.publicId, "keywords", fixture.db),
      ).rejects.toThrow();
      await expect(
        createSavedViewV2For({ ...createInput(), visibility: "project" }, context, fixture.db),
      ).rejects.toThrow();
      await expect(
        setPersonalDefaultFor(
          {
            expectedRevision: 0,
            projectId: project.publicId,
            surface: "keywords",
            target: { kind: "preset", presetId: "general" },
            userId: context.actor.id,
          },
          admin,
          fixture.db,
        ),
      ).rejects.toThrow();
    });

    it("serializes duplicate creates and revision0 writes from two devices, retaining tombstones after delete", async () => {
      const input = createInput();
      const [first, second] = await Promise.all([create(input), create(input)]);
      expect(first.id).toBe(second.id);
      expect(await fixture.db.savedView.count({ where: { projectId: project.id } })).toBe(1);
      expect(
        await fixture.db.savedViewCreationRequest.count({ where: { projectId: project.id } }),
      ).toBe(1);
      await expect(create({ ...input, name: "Changed retry" })).rejects.toMatchObject({
        status: 409,
      });
      const defaultInput = {
        expectedRevision: 0,
        projectId: project.publicId,
        surface: "keywords",
        target: { kind: "saved_view", viewId: first.id },
      };
      const results = await Promise.allSettled([
        setPersonalDefaultFor(defaultInput, context, fixture.db),
        setPersonalDefaultFor(defaultInput, context, fixture.db),
      ]);
      expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
      await deleteSavedViewV2For(
        { expectedRevision: first.revision, projectId: project.publicId, viewId: first.id },
        context,
        fixture.db,
      );
      const fallback = await read();
      expect(fallback).toMatchObject({
        defaultTarget: { kind: "preset", presetId: "general" },
        notice: "unavailable_default",
      });
      expect(JSON.stringify(fallback)).not.toContain(first.id);
      expect(JSON.stringify(fallback)).not.toContain(first.name);
      await expect(create(input)).rejects.toMatchObject({ status: 404 });
      expect(await fixture.db.savedView.count({ where: { projectId: project.id } })).toBe(0);
      await setPersonalDefaultFor(
        {
          ...defaultInput,
          expectedRevision: fallback.revision,
          target: { kind: "preset", presetId: "general" },
        },
        context,
        fixture.db,
      );
      expect(await read()).toMatchObject({ notice: null });
    });
  },
);
