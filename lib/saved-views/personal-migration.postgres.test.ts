import { makePublicId } from "@/lib/db/public-id";
import { describe, expect, it } from "vitest";
import { personalViewDatabase } from "./postgres-test-fixture";

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "personal-view expand migration on the full schema",
  () => {
    it("preserves legacy JSON/null authors, enforces private ownership and retains only tombstone IDs after deletion", async () => {
      const config = {
        filters: { tags: ["Service"] },
        lens: { device: "mobile", locationId: "krakow" },
        search: "legacy",
        surface: "keywords",
        version: 1,
      };
      const publicId = makePublicId("viw");
      const fixture = await personalViewDatabase(async (client) => {
        await client.query(
          `INSERT INTO users(id,"publicId",name,email,"updatedAt") VALUES ('owner',$1,'Owner','owner@example.test',now())`,
          [makePublicId("usr")],
        );
        await client.query(
          `INSERT INTO projects(id,"publicId",name,domain,"ownerId","updatedAt") VALUES ('project',$1,'Project','example.test','owner',now())`,
          [makePublicId("prj")],
        );
        await client.query(
          `INSERT INTO saved_views(id,"publicId","projectId","createdById",name,surface,config,"updatedAt") VALUES ('legacy',$1,'project',NULL,'Legacy','keywords',$2,now())`,
          [publicId, JSON.stringify(config)],
        );
      });
      try {
        expect(await fixture.db.savedView.findUnique({ where: { id: "legacy" } })).toMatchObject({
          config,
          createdById: null,
          ownerId: null,
          revision: 1,
          visibility: "project",
        });
        expect(await fixture.db.userProjectSurfacePreference.count()).toBe(0);
        await expect(
          fixture.client.query(`UPDATE saved_views SET visibility='private' WHERE id='legacy'`),
        ).rejects.toThrow();
        await expect(
          fixture.client.query(`UPDATE saved_views SET revision=0 WHERE id='legacy'`),
        ).rejects.toThrow();
        await fixture.db.userProjectSurfacePreference.create({
          data: {
            projectId: "project",
            surface: "keywords",
            userId: "owner",
            defaultSavedViewId: "legacy",
            defaultSavedViewPublicId: publicId,
          },
        });
        await fixture.db.savedViewCreationRequest.create({
          data: {
            inputHash: "a".repeat(64),
            projectId: "project",
            requestId: "request-123",
            savedViewId: "legacy",
            savedViewPublicId: publicId,
            userId: "owner",
          },
        });
        await fixture.db.savedView.delete({ where: { id: "legacy" } });
        expect(await fixture.db.userProjectSurfacePreference.findFirst()).toMatchObject({
          defaultSavedViewId: null,
          defaultSavedViewPublicId: publicId,
        });
        expect(await fixture.db.savedViewCreationRequest.findFirst()).toMatchObject({
          savedViewId: null,
          savedViewPublicId: publicId,
        });
        await fixture.db.project.delete({ where: { id: "project" } });
        expect(await fixture.db.userProjectSurfacePreference.count()).toBe(0);
        expect(await fixture.db.savedViewCreationRequest.count()).toBe(0);
      } finally {
        await fixture.close();
      }
    }, 60000);

    it("cascades a user's personal rows while shared views keep their null creator", async () => {
      const fixture = await personalViewDatabase();
      try {
        const owner = await fixture.db.user.create({
          data: {
            email: "project-owner@example.test",
            name: "Owner",
            publicId: makePublicId("usr"),
          },
        });
        const personalOwner = await fixture.db.user.create({
          data: {
            email: "personal-owner@example.test",
            name: "Member",
            publicId: makePublicId("usr"),
          },
        });
        const project = await fixture.db.project.create({
          data: {
            domain: "example.test",
            name: "Project",
            ownerId: owner.id,
            publicId: makePublicId("prj"),
          },
        });
        const common = {
          config: { surface: "keywords", version: 1 },
          createdById: personalOwner.id,
          name: "View",
          projectId: project.id,
        };
        await fixture.db.savedView.create({
          data: {
            ...common,
            ownerId: personalOwner.id,
            publicId: makePublicId("viw"),
            visibility: "private",
          },
        });
        const shared = await fixture.db.savedView.create({
          data: { ...common, publicId: makePublicId("viw"), visibility: "project" },
        });
        await fixture.db.userProjectSurfacePreference.create({
          data: { projectId: project.id, surface: "keywords", userId: personalOwner.id },
        });
        await fixture.db.savedViewCreationRequest.create({
          data: {
            inputHash: "a".repeat(64),
            projectId: project.id,
            requestId: "request-123",
            savedViewPublicId: shared.publicId,
            userId: personalOwner.id,
          },
        });
        await fixture.db.user.delete({ where: { id: personalOwner.id } });
        expect(await fixture.db.savedView.findMany()).toMatchObject([
          { id: shared.id, visibility: "project", ownerId: null, createdById: null },
        ]);
        expect(await fixture.db.userProjectSurfacePreference.count()).toBe(0);
        expect(await fixture.db.savedViewCreationRequest.count()).toBe(0);
      } finally {
        await fixture.close();
      }
    }, 60000);
  },
);
