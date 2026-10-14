import { randomUUID } from "node:crypto";
import { AuthorizationError } from "@/lib/auth/authorize";
import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import { makePublicId } from "@/lib/db/public-id";
import { type SavedViewContext, sessionSavedViewContext } from "@/lib/saved-views/context";
import { ViewPreferenceConflictError } from "@/lib/saved-views/errors";
import { personalViewDatabase } from "@/lib/saved-views/postgres-test-fixture";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
  readDashboardPreferenceFor,
  saveDashboardLayoutFor,
  setDashboardDefaultFor,
} from "./dashboard-store";
import { setPersonalDefaultFor } from "./service";
import { readPersonalSurfacePreferenceFor } from "./store";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "personal dashboard actual database contract",
  () => {
    let fixture: Awaited<ReturnType<typeof personalViewDatabase>>;
    let context: SavedViewContext;
    let other: SavedViewContext;
    let project: { id: string; publicId: string };
    beforeAll(async () => {
      fixture = await personalViewDatabase();
    }, 60000);
    afterAll(async () => {
      await fixture?.close();
    });
    beforeEach(async () => {
      const suffix = randomUUID();
      const users = await Promise.all(
        ["viewer", "admin"].map((role) =>
          fixture.db.user.create({
            data: {
              email: `${role}-${suffix}@example.test`,
              name: role,
              publicId: makePublicId("usr"),
            },
          }),
        ),
      );
      project = await fixture.db.project.create({
        data: {
          domain: "example.test",
          name: "Dashboard",
          ownerId: users[0].id,
          publicId: makePublicId("prj"),
        },
      });
      await fixture.db.membership.createMany({
        data: users.map((user, index) => ({
          userId: user.id,
          projectId: project.id,
          role: index === 0 ? ("viewer" as const) : ("admin" as const),
          publicId: makePublicId("mbr"),
        })),
      });
      context = sessionSavedViewContext({ id: users[0].id, memberships: [] });
      other = sessionSavedViewContext({ id: users[1].id, memberships: [] });
    });
    const read = (actor = context) =>
      readDashboardPreferenceFor(actor, project.publicId, fixture.db);
    const save = (expectedRevision: number, layout = presetDashboardLayout("local")) =>
      saveDashboardLayoutFor(
        { projectId: project.publicId, expectedRevision, layout },
        context,
        fixture.db,
      );

    it.each(["local", "competitors"] as const)(
      "generic table defaults cannot overwrite the stored %s dashboard preset",
      async (preset) => {
        await save(0, presetDashboardLayout(preset));
        await setDashboardDefaultFor(
          { projectId: project.publicId, expectedRevision: 1, preset },
          context,
          fixture.db,
        );
        const before = await fixture.db.userProjectSurfacePreference.findUniqueOrThrow({
          where: {
            userId_projectId_surface: {
              userId: context.actor.id,
              projectId: project.id,
              surface: "dashboard",
            },
          },
        });
        await expect(
          setPersonalDefaultFor(
            {
              projectId: project.publicId,
              expectedRevision: 2,
              surface: "dashboard",
              target: { kind: "preset", presetId: "general" },
            },
            context,
            fixture.db,
          ),
        ).rejects.toThrow(ZodError);
        await expect(
          readPersonalSurfacePreferenceFor(context, project.publicId, "dashboard", fixture.db),
        ).rejects.toThrow(ZodError);
        expect(
          await fixture.db.userProjectSurfacePreference.findUniqueOrThrow({
            where: { id: before.id },
          }),
        ).toEqual(before);
        expect(await read()).toMatchObject({ revision: 2, defaultPreset: preset });
      },
    );

    it("saving Local display does not switch the default or another member's preference", async () => {
      expect(await read()).toMatchObject({ revision: 0, defaultPreset: "general" });
      const saved = await save(0);
      expect(saved).toMatchObject({
        revision: 1,
        defaultPreset: "general",
        presentation: { layouts: { local: { preset: "local" } } },
      });
      expect(await read(other)).toMatchObject({
        revision: 0,
        defaultPreset: "general",
        presentation: { layouts: {} },
      });
      expect(
        await setDashboardDefaultFor(
          { projectId: project.publicId, expectedRevision: 1, preset: "local" },
          context,
          fixture.db,
        ),
      ).toMatchObject({ revision: 2, defaultPreset: "local" });
      expect((await read(other)).defaultPreset).toBe("general");
    });
    it("does not overwrite a newer device layout or accept a client-supplied owner", async () => {
      await save(0);
      await expect(save(0, presetDashboardLayout("general"))).rejects.toThrow(
        ViewPreferenceConflictError,
      );
      await expect(
        saveDashboardLayoutFor(
          {
            projectId: project.publicId,
            expectedRevision: 1,
            layout: presetDashboardLayout("general"),
            userId: other.actor.id,
          },
          context,
          fixture.db,
        ),
      ).rejects.toThrow();
      expect((await read()).presentation.layouts.local).toBeDefined();
      expect((await read()).presentation.layouts.general).toBeUndefined();
    });
    it("denies revoked membership and twenty view writes have zero HTTP or schedule changes", async () => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockRejectedValue(new Error("Display settings must not call HTTP"));
      try {
        const schedules = await fixture.db.checkSchedule.findMany();
        const checks = await fixture.db.rankCheck.count();
        for (let index = 0; index < 20; index++) {
          await save(index, { ...presetDashboardLayout(), widgets: [] });
        }
        expect(fetch).not.toHaveBeenCalled();
        expect(await fixture.db.rankCheck.count()).toBe(checks);
        expect(await fixture.db.checkSchedule.findMany()).toEqual(schedules);
        await fixture.db.membership.delete({
          where: { userId_projectId: { userId: context.actor.id, projectId: project.id } },
        });
        await expect(read()).rejects.toThrow(AuthorizationError);
        await expect(save(20)).rejects.toThrow(AuthorizationError);
      } finally {
        fetch.mockRestore();
      }
    });
  },
);
