import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import {
  legacyNotificationQuarantineMigration,
  previewLegacyNotificationQuarantine,
} from "@/scripts/data-migrations/20261104061000_legacy_notification_quarantine";
import pg from "pg";
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

import { getNotificationFeedForScope } from "./feed";

describe.skipIf(!process.env.METERING_TEST_DATABASE_URL)(
  "legacy notification quarantine PostgreSQL",
  () => {
    it("previews, quarantines in batches, preserves payloads and account notices, and replays safely", async () => {
      const f = await closeoutPostgresFixture();
      owned.db = f.db;
      try {
        const user = await f.db.user.create({
          data: { publicId: makePublicId("usr"), name: "Fixture", email: "fixture@example.com" },
        });
        const project = await f.db.project.create({
          data: {
            publicId: makePublicId("prj"),
            name: "Fixture",
            domain: "example.org",
            ownerId: user.id,
          },
        });
        const projectTypes = [
          "alert_fired",
          "check_complete",
          "check_failed",
          "import_done",
          "import_failed",
          "provider_incident",
          "manual_run_summary",
          "scheduled_window_summary",
        ] as const;
        const legacy = await Promise.all(
          projectTypes.map((type) =>
            f.db.notification.create({
              data: {
                publicId: makePublicId("ntf"),
                userId: user.id,
                type,
                title: type,
                payload: { original: true },
              },
            }),
          ),
        );
        const referenced = await Promise.all(
          [
            { nested: { projectId: "legacy-id" } },
            { projectSlug: "old-project" },
            { project: { slug: "old-project" } },
            { projectRef: "legacy-id" },
            { href: "/p/old-project/alerts" },
            { href: "/app/prj_abcdefghijklmnopqrstuvwx/runs" },
            { href: "/projects/old-project" },
            { nested: [{ projectPublicId: "prj_abcdefghijklmnopqrstuvwx" }] },
          ].map((payload) =>
            f.db.notification.create({
              data: {
                publicId: makePublicId("ntf"),
                userId: user.id,
                type: "system",
                title: "Legacy",
                payload,
              },
            }),
          ),
        );
        const account = await f.db.notification.create({
          data: {
            publicId: makePublicId("ntf"),
            userId: user.id,
            type: "system",
            title: "Account",
            payload: { href: "/app/account/security", projectId: null },
          },
        });
        const live = await f.db.notification.create({
          data: {
            publicId: makePublicId("ntf"),
            userId: user.id,
            projectId: project.id,
            type: "alert_fired",
            title: "Live",
          },
        });
        const alreadyWithdrawn = await f.db.notification.create({
          data: {
            publicId: makePublicId("ntf"),
            userId: user.id,
            type: "system",
            title: "Withdrawn",
            payload: { project_id: "old" },
            withdrawnAt: new Date("2020-01-01T00:00:00Z"),
          },
        });
        const expected = legacy.length + referenced.length + 1;
        expect(await previewLegacyNotificationQuarantine(f.client)).toBe(expected);
        expect(
          await f.db.notification.count({ where: { legacyProjectQuarantinedAt: { not: null } } }),
        ).toBe(0);
        console.log(`legacy quarantine dry-run candidate count: ${expected}`);
        await legacyNotificationQuarantineMigration.run({
          db: f.client,
          batchSize: 2,
          log: () => {},
        });
        expect(await previewLegacyNotificationQuarantine(f.client)).toBe(0);
        const firstPass = await f.db.notification.findMany({
          where: { legacyProjectQuarantinedAt: { not: null } },
          orderBy: { id: "asc" },
        });
        await legacyNotificationQuarantineMigration.run({
          db: f.client,
          batchSize: 2,
          log: () => {},
        });
        expect(
          await f.db.notification.findMany({
            where: { legacyProjectQuarantinedAt: { not: null } },
            orderBy: { id: "asc" },
          }),
        ).toEqual(firstPass);
        for (const row of [...legacy, ...referenced, alreadyWithdrawn]) {
          const after = await f.db.notification.findUniqueOrThrow({ where: { id: row.id } });
          expect(after.legacyProjectQuarantinedAt).not.toBeNull();
          expect(after.payload).toEqual(row.payload);
          expect(after.withdrawnAt).toEqual(row.withdrawnAt);
        }
        expect(await f.db.notification.findUniqueOrThrow({ where: { id: account.id } })).toEqual(
          account,
        );
        expect(await f.db.notification.findUniqueOrThrow({ where: { id: live.id } })).toEqual(live);
        const global = await getNotificationFeedForScope(
          { userId: user.id, activeProjectId: null },
          { locale: "en" },
        );
        expect(global.items.map((item) => item.id)).toEqual([account.publicId]);
        expect(global.unreadCount).toBe(1);
        const scoped = await getNotificationFeedForScope(
          { userId: user.id, activeProjectId: project.id },
          { locale: "en" },
        );
        expect(scoped.items.map((item) => item.id)).toEqual(
          expect.arrayContaining([account.publicId, live.publicId]),
        );
        expect(scoped.items).toHaveLength(2);
      } finally {
        owned.db = null;
        await f.close();
      }
    }, 120_000);
    it("protects an old deletion after the backfill and preserves unrelated notices", async () => {
      const f = await closeoutPostgresFixture();
      owned.db = f.db;
      try {
        const user = await f.db.user.create({
          data: { publicId: makePublicId("usr"), name: "Fixture", email: "race@example.com" },
        });
        const project = await f.db.project.create({
          data: {
            publicId: makePublicId("prj"),
            name: "Fixture",
            domain: "example.com",
            ownerId: user.id,
          },
        });
        const row = await f.db.notification.create({
          data: {
            publicId: makePublicId("ntf"),
            userId: user.id,
            projectId: project.id,
            type: "system",
            title: "Project",
            payload: { original: true },
          },
        });
        const account = await f.db.notification.create({
          data: {
            publicId: makePublicId("ntf"),
            userId: user.id,
            type: "system",
            title: "Account",
          },
        });
        await legacyNotificationQuarantineMigration.run({
          db: f.client,
          batchSize: 2,
          log: () => {},
        });
        const incident = await f.db.notification.create({
          data: {
            publicId: makePublicId("ntf"),
            userId: user.id,
            projectId: project.id,
            type: "provider_incident",
            title: "Incident",
            payload: { original: true },
          },
        });
        await expect(
          f.db.$transaction(async (tx) => {
            await tx.notification.deleteMany({
              where: { projectId: project.id, type: "provider_incident" },
            });
            await tx.project.delete({ where: { id: project.id } });
          }),
        ).rejects.toThrow(/notification retention/);
        expect(await f.db.notification.findUniqueOrThrow({ where: { id: incident.id } })).toEqual(
          incident,
        );
        await f.db.project.delete({ where: { id: project.id } });
        const retained = await f.db.notification.findUniqueOrThrow({ where: { id: row.id } });
        expect(retained.projectId).toBeNull();
        expect(retained.withdrawnAt).not.toBeNull();
        expect(retained.payload).toEqual(row.payload);
        expect(
          (await f.db.notification.findUniqueOrThrow({ where: { id: incident.id } })).withdrawnAt,
        ).not.toBeNull();
        expect(await f.db.notification.findUniqueOrThrow({ where: { id: account.id } })).toEqual(
          account,
        );
        expect(
          (
            await getNotificationFeedForScope(
              { userId: user.id, activeProjectId: null },
              { locale: "en" },
            )
          ).items.map((item) => item.id),
        ).toEqual([account.publicId]);
      } finally {
        owned.db = null;
        await f.close();
      }
    }, 120_000);

    it("pages sparse rows and times out on a locked candidate, then safely replays", async () => {
      const f = await closeoutPostgresFixture();
      const locker = new pg.Client({ connectionString: f.url });
      try {
        const user = await f.db.user.create({
          data: { publicId: makePublicId("usr"), name: "Fixture", email: "sparse@example.com" },
        });
        for (let i = 0; i < 40; i++) {
          await f.db.notification.create({
            data: {
              id: `sparse-${String(i).padStart(3, "0")}`,
              publicId: makePublicId("ntf"),
              userId: user.id,
              type: i % 10 === 0 ? "alert_fired" : "system",
              title: "Fixture",
              legacyProjectQuarantinedAt: i === 20 ? new Date("2020-01-01T00:00:00Z") : null,
            },
          });
        }
        await locker.connect();
        await locker.query("BEGIN");
        await locker.query("SELECT id FROM notifications WHERE id=$1 FOR UPDATE", ["sparse-030"]);
        const logs: string[] = [];
        const release = setTimeout(() => {
          void locker.query("ROLLBACK");
        }, 20_000);
        try {
          await expect(
            legacyNotificationQuarantineMigration.run({
              db: f.client,
              batchSize: 5,
              log: (line) => logs.push(line),
            }),
          ).rejects.toThrow(/lock timeout/i);
        } finally {
          clearTimeout(release);
        }
        expect(logs.filter((line) => line.includes("scanned=")).length).toBeGreaterThan(1);
        await locker.query("ROLLBACK");
        await legacyNotificationQuarantineMigration.run({
          db: f.client,
          batchSize: 5,
          log: (line) => logs.push(line),
        });
        expect(
          await f.db.notification.count({
            where: { type: "alert_fired", legacyProjectQuarantinedAt: null },
          }),
        ).toBe(0);
        expect(
          await f.db.notification.count({
            where: { type: "system", legacyProjectQuarantinedAt: { not: null } },
          }),
        ).toBe(0);
        expect(
          logs
            .filter((line) => line.includes("scanned="))
            .every((line) => Number(line.match(/scanned=(\d+)/)?.[1]) <= 5),
        ).toBe(true);
        let delayed = false;
        const slowDatabase = {
          async query(sql: string, values?: readonly unknown[]) {
            if (!delayed && sql.startsWith("SELECT id FROM notifications")) {
              delayed = true;
              await f.client.query("SELECT pg_sleep(12)");
            }
            return f.client.query(sql, values ? [...values] : undefined);
          },
        };
        await expect(
          legacyNotificationQuarantineMigration.run({
            db: slowDatabase,
            batchSize: 5,
            log: () => {},
          }),
        ).rejects.toThrow(/statement timeout/i);
      } finally {
        await locker.query("ROLLBACK").catch(() => {});
        await locker.end();
        await f.close();
      }
    }, 120_000);
  },
);
