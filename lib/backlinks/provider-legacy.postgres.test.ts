import { randomUUID } from "node:crypto";
import { businessLocationDatabase } from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { findBacklinksSnapshot } from "./snapshot";
import { findStoredBacklinks } from "./stored";

const holder = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock("@/lib/db/prisma", () => {
  function client() {
    if (!holder.client) throw new Error("Owned PostgreSQL fixture is not initialized.");
    return holder.client;
  }
  return {
    prisma: {
      backlinkSnapshot: {
        findFirst: (input: object) => client().backlinkSnapshot.findFirst(input),
      },
      $queryRaw: (input: TemplateStringsArray, ...values: unknown[]) =>
        client().$queryRaw(input, ...values),
    },
  };
});

describe("legacy backlink source SQL", () => {
  let fixture: Awaited<ReturnType<typeof businessLocationDatabase>>;
  let projectId: string;
  beforeAll(async () => {
    fixture = await businessLocationDatabase();
    holder.client = fixture.db;
    const owner = await fixture.db.user.create({
      data: {
        publicId: makePublicId("usr"),
        name: "Fixture",
        email: `${randomUUID()}@example.com`,
      },
    });
    const project = await fixture.db.project.create({
      data: {
        publicId: makePublicId("prj"),
        ownerId: owner.id,
        name: "Fixture",
        domain: "example.com",
      },
    });
    projectId = project.id;
  }, 60_000);
  afterAll(async () => {
    await fixture?.close();
  });

  it("reopens missing, blank and non-string metadata without reading a known provider", async () => {
    for (const [index, summary] of [
      {},
      { _provider: "" },
      { _provider: " \t\n\u00a0" },
      { _provider: null },
      { _provider: 123 },
    ].entries()) {
      const target = `legacy${index}.example.com`;
      const data = {
        projectId,
        target,
        targetScope: "site",
        includeSubdomains: true,
        history: [],
        fetchedRowCount: 100,
        totalRowsAvailable: 100,
        costCents: 0,
        expiresAt: new Date("2027-01-01T00:00:00Z"),
        fetchedAt: new Date("2026-10-01T00:00:00Z"),
      };
      const legacy = await fixture.db.backlinkSnapshot.create({
        data: { ...data, summary: { _mode: "as_is", ...summary } },
      });
      await fixture.db.backlinkSnapshot.create({
        data: {
          ...data,
          fetchedAt: new Date("2026-10-02T00:00:00Z"),
          summary: { _mode: "as_is", _provider: "dataforseo" },
        },
      });
      const request = {
        includeSubdomains: true,
        minRows: 100,
        mode: "as_is" as const,
        now: new Date("2026-10-14T00:00:00Z"),
        projectId,
        provider: "unknown",
        scope: "site" as const,
        target,
      };
      // A literal JSON-path comparison cannot find absent provider metadata.
      expect(
        await fixture.db.backlinkSnapshot.findFirst({
          where: { projectId, target, summary: { path: ["_provider"], equals: "unknown" } },
        }),
      ).toBeNull();
      expect((await findBacklinksSnapshot(request))?.id).toBe(legacy.id);
      expect(await findStoredBacklinks({ ...request, targetScope: "site" })).toMatchObject({
        provider: "unknown",
        fetchedAt: "2026-10-01T00:00:00.000Z",
        costCents: 0,
      });
      expect((await findBacklinksSnapshot({ ...request, provider: "dataforseo" }))?.id).not.toBe(
        legacy.id,
      );
    }
  }, 30_000);
});
