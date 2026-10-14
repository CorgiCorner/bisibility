import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id-resources";
import { Prisma } from "@/lib/generated/prisma/client";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import { persistLocalPointRevision } from "@/lib/local-monitoring-store/point-repository";
import { describe, expect, it } from "vitest";
import { assertMonitorDefinition, buildMonitorDefinition } from "./definition";
import type { MonitorDefinition } from "./model";
import { monitorDatabase } from "./postgres.test-fixture";
import { createLocalMonitor } from "./write";

type Fixture = Awaited<ReturnType<typeof monitorDatabase>>;
type Corruption = {
  collection: "point" | "keyword" | "root";
  field: string;
  value: "missing" | "null";
};
async function sourceRows(f: Fixture, revisionId: string) {
  const revision = await f.db.localMonitorRevision.findUniqueOrThrow({ where: { id: revisionId } });
  return {
    revision,
    definition: assertMonitorDefinition(revision.snapshot as unknown as MonitorDefinition),
  };
}

async function appendCopy(
  f: Fixture,
  source: Awaited<ReturnType<typeof sourceRows>>,
  corruption?: Corruption,
) {
  return f.db.$transaction(async (tx) => {
    const monitorId = randomUUID(),
      revisionId = randomUUID(),
      intentId = randomUUID();
    const definition = buildMonitorDefinition(f.command.definition, {
      entityId: source.revision.entityId,
      keywords: source.definition.keywords,
      revisionId,
    });
    const snapshot = JSON.parse(JSON.stringify(definition)) as Record<string, unknown>;
    const grid = snapshot.grid as Record<string, unknown>;
    if (corruption) {
      const target =
        corruption.collection === "root"
          ? snapshot
          : corruption.collection === "point"
            ? (grid.points as Record<string, unknown>[])[0]
            : (snapshot.keywords as Record<string, unknown>[])[0];
      if (corruption.value === "missing") delete target[corruption.field];
      else target[corruption.field] = null;
    }
    await tx.localMonitor.create({
      data: {
        id: monitorId,
        publicId: makePublicId("lmn"),
        projectId: f.project.id,
        name: f.command.definition.name,
        version: 0,
      },
    });
    await tx.localMonitorRevision.create({
      data: {
        ...source.revision,
        id: revisionId,
        monitorId,
        snapshot: snapshot as Prisma.InputJsonValue,
        gridRevisionKey: definition.grid.revisionKey,
        contentHash: localDigest(definition),
        actorId: null,
      },
    });
    for (const point of definition.grid.points)
      await persistLocalPointRevision(tx, f.project.id, f.writer.id, point.point);
    await tx.localMonitorGridPoint.createMany({
      data: definition.grid.points.map((point) => ({
        projectId: f.project.id,
        revisionId,
        pointId: point.point.revisionId,
        ordinal: point.ordinal,
        row: point.row,
        column: point.column,
      })),
    });
    await tx.localMonitorKeyword.createMany({
      data: definition.keywords.map((keyword, ordinal) => ({
        projectId: f.project.id,
        revisionId,
        keywordId: null,
        keywordPublicId: keyword.publicId,
        sourceHash: keyword.sourceHash,
        ordinal,
      })),
    });
    await tx.localMonitorScheduleIntent.create({
      data: {
        id: intentId,
        projectId: f.project.id,
        monitorId,
        definitionRevisionId: revisionId,
        previousRevisionId: null,
        revision: 1,
        mode: "manual",
        scheduleId: null,
        snapshot: Prisma.DbNull,
        approvalDigest: null,
        capabilityVersion: null,
        actorId: null,
      },
    });
    await tx.localMonitor.update({
      where: { id: monitorId },
      data: { version: 1, currentRevisionId: revisionId, currentScheduleIntentId: intentId },
    });
  });
}

describe.skipIf(!process.env.PROVIDER_UI_TEST_DATABASE_URL)(
  "monitor required JSON membership fields",
  () => {
    it("rejects missing and null required values while preserving nullable actor, keyword and manual-calendar fields", async () => {
      const f = await monitorDatabase();
      try {
        const created = await createLocalMonitor(f.command, f.writerContext, { db: f.db });
        const source = await sourceRows(f, created.receipt.revisionId);
        await appendCopy(f, source);
        const before = await f.db.localMonitor.count();
        const cases: Omit<Corruption, "value">[] = [
          ...["ordinal", "row", "column", "point"].map((field) => ({
            collection: "point" as const,
            field,
          })),
          ...["id", "publicId", "sourceHash"].map((field) => ({
            collection: "keyword" as const,
            field,
          })),
          ...["name", "version"].map((field) => ({ collection: "root" as const, field })),
        ];
        for (const item of cases)
          for (const value of ["missing", "null"] as const) {
            await expect(appendCopy(f, source, { ...item, value })).rejects.toThrow();
            expect(await f.db.localMonitor.count()).toBe(before);
          }
      } finally {
        await f.close();
      }
    }, 120000);
  },
);
