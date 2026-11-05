import type { ApiContext } from "@/lib/api/context";
import { makePublicId } from "@/lib/db/public-id";
import { NotificationType, type PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import { describe, expect, it, vi } from "vitest";

const owned = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, property) {
        if (!owned.db) throw new Error("Fixture database not bound");
        const value = Reflect.get(owned.db, property, owned.db);
        return typeof value === "function" ? value.bind(owned.db) : value;
      },
    },
  ),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => ({ id: "sample-owner" }),
  parseActionInput: (_schema: unknown, input: unknown) => input,
  requireProjectScope: async (_actor: unknown, _action: unknown, id: string) =>
    owned.db?.project.findUniqueOrThrow({ where: { id } }),
  revalidateRankCheckViews: vi.fn(),
  revalidateSettingsViews: vi.fn(),
}));
vi.mock("@/lib/account/account-deletion-extension", () => ({ onAccountDeletion: vi.fn() }));
vi.mock("@/lib/analytics/person-deletion", () => ({
  queueAnalyticsPersonDeletion: vi.fn(),
  flushAnalyticsPersonDeletions: vi.fn(),
}));

import { deleteAccountRecords } from "@/lib/account/account-deletion";
import { removeSampleData } from "@/lib/actions/sample-data";
import { deleteProject } from "@/lib/api/projects";
import { deleteProjectById, readProjectDeleteSnapshot } from "@/lib/projects/settings-store";
import { getNotificationFeedForScope } from "./feed";

describe.skipIf(!process.env.METERING_TEST_DATABASE_URL)(
  "project deletion notification retention",
  () => {
    it.each(["settings", "api", "account", "sample"])(
      "retains but hides every project row after %s deletion",
      async (path) => {
        const f = await closeoutPostgresFixture();
        owned.db = f.db;
        try {
          const owner = await f.db.user.create({
            data: {
              publicId: makePublicId("usr"),
              id: "sample-owner",
              name: "Owner",
              email: "owner@example.com",
            },
          });
          const member = await f.db.user.create({
            data: { publicId: makePublicId("usr"), name: "Member", email: "member@example.com" },
          });
          const project = await f.db.project.create({
            data: {
              publicId: makePublicId("prj"),
              name: "Project",
              domain: "example.com",
              ownerId: owner.id,
              isSample: path === "sample",
            },
          });
          const other = await f.db.project.create({
            data: {
              publicId: makePublicId("prj"),
              name: "Other",
              domain: "example.org",
              ownerId: member.id,
            },
          });
          const membership = await f.db.membership.create({
            data: { publicId: makePublicId("mbr"), userId: member.id, projectId: project.id },
          });
          const rows = await Promise.all(
            Object.values(NotificationType).map((type) =>
              f.db.notification.create({
                data: {
                  publicId: makePublicId("ntf"),
                  userId: owner.id,
                  projectId: project.id,
                  type,
                  title: type,
                  payload: { marker: "historical" },
                },
              }),
            ),
          );
          const historical = await f.db.notification.create({
            data: {
              publicId: makePublicId("ntf"),
              userId: member.id,
              projectId: project.id,
              type: "alert_fired",
              title: "Historical",
              payload: { marker: "historical" },
            },
          });
          const account = await f.db.notification.create({
            data: {
              publicId: makePublicId("ntf"),
              userId: member.id,
              type: "system",
              title: "Account notice",
            },
          });
          const otherRow = await f.db.notification.create({
            data: {
              publicId: makePublicId("ntf"),
              userId: member.id,
              projectId: other.id,
              type: "system",
              title: "Other project",
            },
          });
          await f.db.membership.delete({ where: { id: membership.id } });
          if (path === "sample") {
            await removeSampleData({ projectId: project.id });
          } else if (path === "settings") {
            const before = await readProjectDeleteSnapshot(project.id);
            if (!before) throw new Error("Missing project");
            await deleteProjectById(project.id, {
              actorId: owner.id,
              before,
              targetId: project.publicId,
            });
          } else if (path === "account") {
            await deleteAccountRecords({
              userId: owner.id,
              confirmEmail: owner.email,
              source: "web",
            });
          } else {
            const url = new URL(`https://example.com/api/v1/projects/${project.publicId}`);
            const ctx: ApiContext = {
              actorId: owner.id,
              auth: {
                apiKey: {
                  id: "fixture",
                  projectId: project.id,
                  name: "Fixture",
                  prefix: "fixture",
                  scopes: ["admin"],
                },
                project,
              },
              headers: new Headers(),
              instance: "fixture",
              method: "DELETE",
              origin: {
                credentialKind: "project_key",
                credentialId: "fixture",
                source: "api",
                surface: "programmatic",
              },
              path: [],
              req: new Request(url, { method: "DELETE" }),
              url,
            };
            await deleteProject(ctx, project.publicId);
          }
          for (const row of [...(path === "account" ? [] : rows), historical]) {
            const retained = await f.db.notification.findUniqueOrThrow({ where: { id: row.id } });
            expect(retained.projectId).toBeNull();
            expect(retained.withdrawnAt).not.toBeNull();
            expect(retained.payload).toEqual({ marker: "historical" });
          }
          expect(await f.db.notification.findUniqueOrThrow({ where: { id: account.id } })).toEqual(
            account,
          );
          expect(await f.db.notification.findUniqueOrThrow({ where: { id: otherRow.id } })).toEqual(
            otherRow,
          );
          const global = await getNotificationFeedForScope(
            { userId: member.id, activeProjectId: null },
            { locale: "en" },
          );
          const scoped = await getNotificationFeedForScope(
            { userId: member.id, activeProjectId: other.id },
            { locale: "en" },
          );
          expect(global.items.map((item) => item.id)).toEqual([account.publicId]);
          expect(scoped.items.map((item) => item.id)).toEqual(
            expect.arrayContaining([account.publicId, otherRow.publicId]),
          );
          expect(scoped.items.map((item) => item.id)).not.toContain(historical.publicId);
          expect(
            (
              await getNotificationFeedForScope(
                { userId: owner.id, activeProjectId: null },
                { locale: "en" },
              )
            ).items,
          ).toEqual([]);
        } finally {
          owned.db = null;
          await f.close();
        }
      },
      120_000,
    );
  },
);
