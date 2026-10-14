import type { ApiContext } from "@/lib/api/context";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { collectLocalMeasurementItem } from "@/lib/local-monitoring-store/collect-item";
import { describe, expect, it, vi } from "vitest";
import { hostedSubmitFixture, hostMeasurementDatabase } from "./host.postgres.test-fixture";

// Route existing caller database access to the real owned full-schema DB, not a fake database.
const owned = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get(_target, property) {
        if (!owned.db) throw new Error("Owned full-schema caller fixture not bound.");
        const value = Reflect.get(owned.db, property, owned.db);
        return typeof value === "function" ? value.bind(owned.db) : value;
      },
    },
  ),
}));

import { deleteProject } from "@/lib/api/projects";
import { deleteProjectById, readProjectDeleteSnapshot } from "@/lib/projects/settings-store";

const suite = describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL);
suite(
  "existing UI deletion service and API handler inherit project DB guards (full schema)",
  () => {
    it("rolls back the UI service audit and deletion when original acceptance is unknown", async () => {
      const f = await hostMeasurementDatabase();
      owned.db = f.db;
      try {
        await hostedSubmitFixture(f, "lost");
        const before = await readProjectDeleteSnapshot(f.project.id);
        if (!before) throw new Error("Synthetic deletion snapshot missing.");
        const audits = await f.db.auditLog.count();
        await expect(
          deleteProjectById(f.project.id, {
            actorId: f.owner.id,
            before,
            targetId: f.project.publicId,
          }),
        ).rejects.toThrow();
        expect(await f.db.auditLog.count()).toBe(audits);
        expect(await f.db.project.count()).toBe(1);
      } finally {
        owned.db = null;
        await f.close();
      }
    }, 120_000);
    it("rolls back the API handler with nullable audit actor without manufacturing authorization", async () => {
      const f = await hostMeasurementDatabase();
      owned.db = f.db;
      try {
        await hostedSubmitFixture(f, "accepted");
        // Handler-layer DB test only. Router authorization is unchanged and separately required.
        const url = new URL(`https://synthetic.test/api/v1/projects/${f.project.publicId}`);
        const context: ApiContext = {
          actorId: null,
          auth: {
            apiKey: {
              id: "synthetic-scoped-id",
              projectId: f.project.id,
              name: "Synthetic",
              prefix: "synthetic",
              scopes: ["admin"],
            },
            project: f.project,
          },
          headers: new Headers(),
          instance: "urn:synthetic:project-delete",
          method: "DELETE",
          origin: {
            credentialKind: "project_key",
            credentialId: "synthetic-scoped-id",
            source: "api",
            surface: "programmatic",
          },
          path: ["projects", f.project.publicId],
          req: new Request(url, { method: "DELETE" }),
          url,
        };
        const audits = await f.db.auditLog.count();
        await expect(deleteProject(context, f.project.publicId)).rejects.toThrow();
        expect(await f.db.auditLog.count()).toBe(audits);
        expect(await f.db.project.count()).toBe(1);
      } finally {
        owned.db = null;
        await f.close();
      }
    }, 120_000);
    it("permits the existing UI service after canonical settlement and complete collection", async () => {
      const f = await hostMeasurementDatabase();
      owned.db = f.db;
      try {
        const h = await hostedSubmitFixture(f, "accepted");
        const lease = await h.lease("collect");
        await collectLocalMeasurementItem(
          h.reference,
          f.writerContext,
          lease,
          f.ports.adapter,
          f.normalizer,
          f.clock,
          f.db,
        );
        const before = await readProjectDeleteSnapshot(f.project.id);
        if (!before) throw new Error("Synthetic deletion snapshot missing.");
        await deleteProjectById(f.project.id, {
          actorId: f.owner.id,
          before,
          targetId: f.project.publicId,
        });
        expect(await f.db.project.count()).toBe(0);
        expect(await f.db.localOriginalSubmitProof.count()).toBe(0);
        expect(await f.db.meteringUsageEvidence.count()).toBe(1);
      } finally {
        owned.db = null;
        await f.close();
      }
    }, 120_000);
  },
);
