import { randomUUID } from "node:crypto";
import type { ApiAuth } from "@/lib/api/auth";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { dispatchMcpTool } from "@/lib/mcp/tools";
import { exportSectionsChunk } from "@/lib/migration/export-chunks";
import { setPersonalDefaultFor } from "@/lib/project-surface-preferences/service";
import { readPersonalSurfacePreferenceFor } from "@/lib/project-surface-preferences/store";
import {
  getSavedView,
  getSessionSavedViewFor,
  listSavedViewsFor,
  listSessionSavedViewsFor,
} from "@/lib/queries/saved-views";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionSavedViewContext } from "./context";
import { personalViewDatabase } from "./postgres-test-fixture";
import { createSavedViewFor, deleteSavedViewFor } from "./service";
import { createSavedViewV2For, deleteSavedViewV2For, updateSavedViewV2For } from "./v2-service";
import { keywordViewFixture } from "./view-test-fixture";

const state = vi.hoisted(() => ({ db: null as PrismaClient | null, sessionUser: "" }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy({} as PrismaClient, {
    get(_target, property) {
      if (!state.db) throw new Error("Fixture not ready");
      const value = Reflect.get(state.db, property);
      return typeof value === "function" ? value.bind(state.db) : value;
    },
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => ({ user: { id: state.sessionUser } }),
}));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));
vi.mock("@/lib/api/idempotency", () => ({ withIdempotency: vi.fn((_ctx, run) => run()) }));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "hosted personal views through real legacy/session transports",
  () => {
    let fixture: Awaited<ReturnType<typeof personalViewDatabase>>;
    let project: Awaited<ReturnType<PrismaClient["project"]["create"]>>;
    let viewer: string, admin: string;
    beforeAll(async () => {
      fixture = await personalViewDatabase();
      state.db = fixture.db;
    }, 60000);
    afterAll(async () => {
      state.db = null;
      await fixture?.close();
    });
    const providerIo = vi.fn(() => {
      throw new Error("External provider I/O is forbidden in saved-view operations");
    });
    afterEach(() => {
      expect(providerIo).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });
    beforeEach(async () => {
      providerIo.mockClear();
      vi.stubGlobal("fetch", providerIo);
      vi.stubEnv("DEPLOYMENT_MODE", "cloud");
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("VERCEL_ENV", "production");
      vi.stubEnv("BISIBILITY_PREVIEW_TEST_AUTH", "0");
      const users = await Promise.all(
        ["Viewer", "Administrator"].map((name) =>
          fixture.db.user.create({
            data: { email: `${randomUUID()}@example.test`, name, publicId: makePublicId("usr") },
          }),
        ),
      );
      [viewer, admin] = users.map((user) => user.id);
      state.sessionUser = viewer;
      project = await fixture.db.project.create({
        data: {
          domain: "example.com",
          name: "Example",
          ownerId: admin,
          publicId: makePublicId("prj"),
        },
      });
      await fixture.db.membership.createMany({
        data: [
          { userId: viewer, role: "viewer" as const },
          { userId: admin, role: "admin" as const },
        ].map((member) => ({ ...member, projectId: project.id, publicId: makePublicId("mbr") })),
      });
    });
    function context(user = viewer) {
      return sessionSavedViewContext({ id: user, memberships: [] });
    }
    function input() {
      return {
        config: keywordViewFixture(),
        name: "Personal secret",
        projectId: project.publicId,
        requestId: randomUUID(),
      };
    }
    function key(): ApiAuth {
      return {
        kind: "project_key",
        project,
        apiKey: {
          id: "key-fixture",
          name: "Fixture",
          prefix: "bsb_key_fixture",
          projectId: project.id,
          scopes: ["read", "write"],
        },
      };
    }

    it("allows hosted viewer creation and idempotent retry without changing shared views or measurements", async () => {
      const data = input();
      const [first, retry] = await Promise.all([
        createSavedViewV2For(data, context(), fixture.db),
        createSavedViewV2For(data, context(), fixture.db),
      ]);
      expect(first.id).toBe(retry.id);
      expect(first).toMatchObject({ visibility: "private", canEdit: true, canDelete: true });
      expect(await fixture.db.savedView.count({ where: { projectId: project.id } })).toBe(1);
      expect(
        await fixture.db.savedViewCreationRequest.count({ where: { projectId: project.id } }),
      ).toBe(1);
      expect(
        await fixture.db.keywordSchedule.count({ where: { keyword: { projectId: project.id } } }),
      ).toBe(0);
      expect(
        await fixture.db.rankCheck.count({ where: { keyword: { projectId: project.id } } }),
      ).toBe(0);
    });

    it.each(["keywords", "competitors"] as const)(
      "hides private %s rows from administrators, project keys, owner PATs and hosted MCP",
      async (surface) => {
        const config =
          surface === "keywords"
            ? keywordViewFixture()
            : {
                grouped: false,
                pageSize: 100 as const,
                presentation: keywordViewFixture().presentation,
                sort: { direction: "asc" as const, field: "keyword" },
                surface: "competitors" as const,
                version: 2 as const,
                filters: { excludedKeywordIds: [], position: "all" as const, tag: null },
                scope: {
                  device: "mobile" as const,
                  engine: "google" as const,
                  locationId: "krakow",
                },
              };
        const personal = await createSavedViewV2For({ ...input(), config }, context(), fixture.db);
        const sharedConfig =
          surface === "keywords"
            ? { surface, version: 1 }
            : {
                surface,
                version: 1,
                filters: config.filters,
                scope: "scope" in config ? config.scope : null,
              };
        const shared = await createSavedViewFor(
          { name: "Shared", config: sharedConfig, projectId: project.publicId },
          context(admin),
          fixture.db,
        );
        expect(
          (await listSessionSavedViewsFor(context(), project.publicId, surface, fixture.db)).map(
            (view) => view.id,
          ),
        ).toEqual(expect.arrayContaining([personal.id, shared.id]));
        expect(
          (
            await listSessionSavedViewsFor(context(admin), project.publicId, surface, fixture.db)
          ).map((view) => view.id),
        ).toEqual([shared.id]);
        expect(
          await getSessionSavedViewFor(
            context(admin),
            project.publicId,
            personal.id,
            surface,
            fixture.db,
          ),
        ).toBeNull();
        state.sessionUser = admin;
        expect(
          await (surface === "keywords"
            ? getSavedView(project.publicId, personal.id)
            : getSavedView(project.publicId, personal.id, "competitors")),
        ).toBeNull();
        expect(
          (
            await listSavedViewsFor(
              { id: viewer, memberships: [{ projectId: project.id, role: "viewer" }] },
              project.publicId,
              surface,
            )
          ).map((view) => view.id),
        ).toEqual([shared.id]);
        const exported = await exportSectionsChunk({ projectId: project.id, userId: admin });
        expect(exported.saved_views.map((view) => view.id)).toEqual([shared.id]);
        const pat: ApiAuth = {
          kind: "personal_token",
          memberships: [{ projectId: project.id, role: "viewer" }],
          token: {
            id: "pat-fixture",
            name: "Fixture",
            prefix: "bsb_pat_live_fixture",
            publicId: null,
            scopes: ["read"],
            userId: viewer,
          },
          user: { id: viewer, name: "Viewer", email: "viewer@example.test", publicId: null },
        };
        for (const auth of [key(), pat]) {
          const result = await dispatchMcpTool(
            "list_saved_views",
            { project_id: project.publicId, surface },
            auth,
          );
          expect(result.status).toBe(200);
          expect(JSON.stringify(result.payload)).not.toContain(personal.id);
          expect(JSON.stringify(result.payload)).not.toContain("Personal secret");
          expect(JSON.stringify(result.payload)).toContain(shared.id);
        }
        const deletion = await dispatchMcpTool(
          "delete_saved_view",
          { project_id: project.publicId, view_id: personal.id },
          key(),
        );
        expect(deletion.status).toBe(200);
        expect(deletion.payload).toMatchObject({ deleted: false });
        await expect(
          deleteSavedViewFor(
            { projectId: project.publicId, viewId: personal.id },
            context(admin),
            fixture.db,
          ),
        ).resolves.toEqual({ deleted: false });
        expect(await fixture.db.savedView.count({ where: { publicId: personal.id } })).toBe(1);
      },
    );

    it("enforces owner CAS/default lifecycle and immediately rejects revoked membership", async () => {
      const personal = await createSavedViewV2For(input(), context(), fixture.db);
      await setPersonalDefaultFor(
        {
          expectedRevision: 0,
          projectId: project.publicId,
          surface: "keywords",
          target: { kind: "saved_view", viewId: personal.id },
        },
        context(),
        fixture.db,
      );
      await expect(
        setPersonalDefaultFor(
          {
            expectedRevision: 0,
            projectId: project.publicId,
            surface: "keywords",
            target: { kind: "saved_view", viewId: personal.id },
          },
          context(admin),
          fixture.db,
        ),
      ).rejects.toMatchObject({ status: 404 });
      const edit = {
        projectId: project.publicId,
        viewId: personal.id,
        expectedRevision: 1,
        name: "Edited",
        config: keywordViewFixture(),
      };
      await updateSavedViewV2For(edit, context(), fixture.db);
      await expect(updateSavedViewV2For(edit, context(), fixture.db)).rejects.toMatchObject({
        status: 409,
      });
      await deleteSavedViewV2For(
        { projectId: project.publicId, viewId: personal.id, expectedRevision: 2 },
        context(),
        fixture.db,
      );
      expect(
        await readPersonalSurfacePreferenceFor(context(), project.publicId, "keywords", fixture.db),
      ).toMatchObject({
        defaultTarget: { kind: "preset", presetId: "general" },
        notice: "unavailable_default",
      });
      await fixture.db.membership.delete({
        where: { userId_projectId: { userId: viewer, projectId: project.id } },
      });
      await expect(createSavedViewV2For(input(), context(), fixture.db)).rejects.toMatchObject({
        code: "forbidden",
      });
      await expect(
        listSessionSavedViewsFor(context(), project.publicId, "keywords", fixture.db),
      ).rejects.toMatchObject({ code: "forbidden" });
    });
  },
);
