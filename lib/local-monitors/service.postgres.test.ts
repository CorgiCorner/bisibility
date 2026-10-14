import { randomUUID } from "node:crypto";
import { createBusinessLocationFor } from "@/lib/business-location-store/location-write";
import {
  identityCommand,
  seedBusinessProject,
} from "@/lib/business-location-store/postgres.test-fixture";
import { monitorDatabase } from "@/lib/local-monitor-store/postgres.test-fixture";
import { readLocalMonitor } from "@/lib/local-monitor-store/read";
import { describe, expect, it, vi } from "vitest";
import { saveMonitorFor } from "./service";
import { readMonitorSetupChoices } from "./setup-read";

vi.mock("server-only", () => ({}));
describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "monitor product bridge with persisted authority",
  () => {
    it("creates, revises and archives through real identity/CAS guards without provider or run creation", async () => {
      const f = await monitorDatabase();
      const fetch = vi.spyOn(globalThis, "fetch");
      try {
        const choices = await readMonitorSetupChoices(
          { projectId: f.project.publicId },
          f.writerContext,
          f.db,
        );
        expect(choices.subjects).toContainEqual(
          expect.objectContaining({
            id: f.command.definition.locationId,
            identityRevisionId: f.command.definition.identityRevisionId,
          }),
        );
        expect(choices.keywords).toContainEqual(
          expect.objectContaining({ id: f.keyword.publicId }),
        );
        expect(choices.permissions.canWrite).toBe(true);
        const command = { ...f.command, operation: "create" as const };
        const created = await saveMonitorFor(command, f.writerContext, f.db);
        expect(created.kind).toBe("saved");
        if (created.kind !== "saved") throw new Error("Monitor fixture creation failed");
        expect(await saveMonitorFor(command, f.writerContext, f.db)).toEqual(created);
        const reference = { projectId: f.project.publicId, monitorId: created.receipt.monitorId };
        const revision = {
          ...reference,
          operation: "revise",
          expectedVersion: created.receipt.version,
          idempotencyKey: randomUUID(),
          definition: { ...f.command.definition, name: "Revised monitor" },
        };
        const revised = await saveMonitorFor(revision, f.writerContext, f.db);
        expect(revised.kind).toBe("saved");
        expect(
          await saveMonitorFor(
            { ...revision, idempotencyKey: randomUUID() },
            f.writerContext,
            f.db,
          ),
        ).toEqual({ kind: "conflict" });
        if (revised.kind !== "saved") throw new Error("Monitor fixture revision failed");
        const detail = await readLocalMonitor(reference, f.writerContext, f.db);
        expect(detail.name).toBe("Revised monitor");
        expect(detail.grid.points).toHaveLength(9);
        expect(detail.schedule.mode).toBe("manual");
        expect(
          await saveMonitorFor(
            {
              ...reference,
              operation: "archive",
              expectedVersion: revised.receipt.version,
              idempotencyKey: randomUUID(),
            },
            f.writerContext,
            f.db,
          ),
        ).toMatchObject({ kind: "saved", receipt: { state: "archived" } });
        expect(await f.db.localMeasurementRun.count()).toBe(0);
        expect(await f.db.localMeasurementTarget.count()).toBe(0);
        expect(await f.db.rankCheck.count()).toBe(0);
        expect(fetch).not.toHaveBeenCalled();
      } finally {
        fetch.mockRestore();
        await f.close();
      }
    }, 120000);
    it("reports precision and unsupported grid errors as invalid without persisting writes", async () => {
      const f = await monitorDatabase();
      try {
        for (const latitude of ["52.12345678", "90"]) {
          expect(
            await saveMonitorFor(
              {
                ...f.command,
                operation: "create",
                definition: {
                  ...f.command.definition,
                  grid: { ...f.command.definition.grid, latitude },
                },
              },
              f.writerContext,
              f.db,
            ),
          ).toEqual({ kind: "invalid" });
        }
        expect(await f.db.localMonitor.count()).toBe(0);
        expect(await f.db.localMonitorRevision.count()).toBe(0);
        expect(await f.db.localMonitorMutation.count()).toBe(0);
        expect(await f.db.localMeasurementPoint.count()).toBe(0);
      } finally {
        await f.close();
      }
    }, 120000);
    it("keeps viewers read-only and rejects revoked membership, client actor injection and foreign subject references", async () => {
      const f = await monitorDatabase();
      try {
        const command = { ...f.command, operation: "create" };
        expect(
          (await readMonitorSetupChoices({ projectId: f.project.publicId }, f.ownerContext, f.db))
            .permissions.canWrite,
        ).toBe(false);
        expect(await saveMonitorFor(command, f.ownerContext, f.db)).toEqual({ kind: "forbidden" });
        expect(
          await saveMonitorFor({ ...command, actor: f.writerContext.actor }, f.writerContext, f.db),
        ).toEqual({ kind: "invalid" });
        const foreign = await seedBusinessProject(f);
        const identity = await createBusinessLocationFor(
          identityCommand(foreign.project.publicId),
          foreign.writerContext,
          f.db,
        );
        if (identity.receipt.kind !== "identity")
          throw new Error("Foreign fixture identity missing");
        const invalid = {
          ...command,
          definition: {
            ...command.definition,
            locationId: identity.receipt.publicId,
            identityRevisionId: identity.receipt.revisionId,
          },
        };
        expect(await saveMonitorFor(invalid, f.writerContext, f.db)).toEqual({
          kind: "unavailable",
        });
        await f.db.membership.deleteMany({
          where: { projectId: f.project.id, userId: f.writer.id },
        });
        expect(await saveMonitorFor(command, f.writerContext, f.db)).toEqual({ kind: "forbidden" });
        await expect(
          readMonitorSetupChoices({ projectId: f.project.publicId }, f.writerContext, f.db),
        ).rejects.toThrow();
        expect(await f.db.localMonitor.count()).toBe(0);
      } finally {
        await f.close();
      }
    }, 120000);
  },
);
