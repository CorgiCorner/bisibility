import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id";
import { describe, expect, it, vi } from "vitest";
import { sessionSavedViewContext } from "./context";
import { MAX_SAVED_VIEWS_PER_SCOPE } from "./creation";
import { personalViewDatabase } from "./postgres-test-fixture";
import { createSavedViewV2For } from "./v2-service";
import { keywordViewFixture } from "./view-test-fixture";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/audit", async (original) => ({
  ...(await original<typeof import("@/lib/auth/audit")>()),
  writeAuditFailure: vi.fn(async () => undefined),
}));

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "saved-view transactional creation",
  () => {
    async function seed(db: Awaited<ReturnType<typeof personalViewDatabase>>["db"]) {
      const user = await db.user.create({
        data: { email: `${randomUUID()}@owner.test`, name: "Owner", publicId: makePublicId("usr") },
      });
      const project = await db.project.create({
        data: {
          domain: "example.test",
          name: "Project",
          ownerId: user.id,
          publicId: makePublicId("prj"),
        },
      });
      await db.membership.create({
        data: {
          projectId: project.id,
          userId: user.id,
          role: "viewer",
          publicId: makePublicId("mbr"),
        },
      });
      return { context: sessionSavedViewContext({ id: user.id, memberships: [] }), project, user };
    }
    it("rolls back both the resource and request receipt when transactional audit fails", async () => {
      const fixture = await personalViewDatabase();
      try {
        const base = await seed(fixture.db);
        await fixture.client.query(
          `CREATE FUNCTION reject_view_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected saved-view audit failure'; END; $$`,
        );
        await fixture.client.query(
          `CREATE TRIGGER reject_view_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_view_audit()`,
        );
        await expect(
          createSavedViewV2For(
            {
              config: keywordViewFixture(),
              name: "Service",
              projectId: base.project.publicId,
              requestId: randomUUID(),
            },
            base.context,
            fixture.db,
          ),
        ).rejects.toThrow("injected saved-view audit failure");
        expect(await fixture.db.savedView.count()).toBe(0);
        expect(await fixture.db.savedViewCreationRequest.count()).toBe(0);
        expect(await fixture.db.auditLog.count()).toBe(0);
      } finally {
        await fixture.close();
      }
    }, 60000);
    it("keeps the quota under concurrent final-slot creates without deleting pre-existing views", async () => {
      const fixture = await personalViewDatabase();
      try {
        const base = await seed(fixture.db);
        await fixture.db.savedView.createMany({
          data: Array.from({ length: MAX_SAVED_VIEWS_PER_SCOPE - 1 }, (_, index) => ({
            config: keywordViewFixture(),
            createdById: base.user.id,
            name: `Existing ${index}`,
            ownerId: base.user.id,
            projectId: base.project.id,
            publicId: makePublicId("viw"),
            visibility: "private" as const,
          })),
        });
        const input = {
          config: keywordViewFixture(),
          name: "Final slot",
          projectId: base.project.publicId,
        };
        const results = await Promise.allSettled([
          createSavedViewV2For({ ...input, requestId: randomUUID() }, base.context, fixture.db),
          createSavedViewV2For({ ...input, requestId: randomUUID() }, base.context, fixture.db),
        ]);
        expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect(rejected).toMatchObject({ reason: { status: 409 } });
        expect(await fixture.db.savedView.count()).toBe(MAX_SAVED_VIEWS_PER_SCOPE);
        expect(
          await fixture.db.savedView.count({ where: { name: { startsWith: "Existing " } } }),
        ).toBe(MAX_SAVED_VIEWS_PER_SCOPE - 1);
      } finally {
        await fixture.close();
      }
    }, 60000);
  },
);
