import { randomUUID } from "node:crypto";
import { businessLocationDatabase } from "@/lib/business-location-store/postgres.test-fixture";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { claimBacklinksAppend } from "./append-claim";
import { retainBacklinksPage, retainedBacklinksPage } from "./append-evidence";
import { appendBacklinksRows } from "./snapshot";

const holder = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    if (!holder.db) throw new Error("Owned fixture unavailable");
    return holder.db;
  },
}));
let fixture: Awaited<ReturnType<typeof businessLocationDatabase>>, projectId: string;
beforeAll(async () => {
  fixture = await businessLocationDatabase();
  holder.db = fixture.db;
  const owner = await fixture.db.user.create({
    data: { publicId: makePublicId("usr"), name: "Fixture", email: `${randomUUID()}@example.com` },
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
}, 60000);
afterAll(async () => {
  await fixture?.close();
});
async function snapshot() {
  return fixture.db.backlinkSnapshot.create({
    data: {
      projectId,
      target: `${randomUUID()}.example.com`,
      targetScope: "site",
      includeSubdomains: true,
      summary: { _provider: "dataforseo", _mode: "as_is" },
      history: [],
      fetchedRowCount: 100,
      totalRowsAvailable: 1000,
      costCents: 2,
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    },
  });
}
it("lets exactly one concurrent caller acquire the paid append offset", async () => {
  const value = await snapshot();
  const results = await Promise.allSettled([
    claimBacklinksAppend(value),
    claimBacklinksAppend(value),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
});
it("retains a paid page across a real transaction rollback and restores it once", async () => {
  const value = await snapshot();
  const claim = await claimBacklinksAppend(value);
  const page = {
    costCents: 1,
    totalCount: 1000,
    rows: [
      {
        anchor: "Fixture",
        domainAuthority: 1,
        firstSeen: null,
        flags: [],
        linksCount: 1,
        lostAt: null,
        sourceDomain: "source.example.com",
        sourceUrl: "https://source.example.com/",
        spamScore: 0,
        status: "active" as const,
        targetUrl: "https://example.com/",
      },
    ],
  };
  const retained = await retainBacklinksPage(value, claim, page);
  const transaction = fixture.db.$transaction.bind(fixture.db);
  const spy = vi.spyOn(fixture.db, "$transaction").mockImplementationOnce(((
    work: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ) =>
    transaction(async (tx) =>
      work(
        new Proxy(tx, {
          get(target, key) {
            return key === "backlinkRow"
              ? {
                  createMany: async () => {
                    throw new Error("injected row write failure");
                  },
                }
              : Reflect.get(target, key);
          },
        }),
      ),
    )) as typeof fixture.db.$transaction);
  try {
    await expect(
      appendBacklinksRows({ snapshot: value, claim: retained, ...page, totalRowsAvailable: 1000 }),
    ).rejects.toThrow("injected row write failure");
  } finally {
    spy.mockRestore();
  }
  const interrupted = await fixture.db.backlinkSnapshot.findUniqueOrThrow({
    where: { id: value.id },
  });
  expect(interrupted.fetchedRowCount).toBe(100);
  const evidence = retainedBacklinksPage(interrupted);
  if (!evidence) throw new Error("Paid evidence lost");
  await appendBacklinksRows({
    snapshot: interrupted,
    claim: evidence.claim,
    ...evidence.page,
    totalRowsAvailable: 1000,
  });
  const restored = await fixture.db.backlinkSnapshot.findUniqueOrThrow({
    where: { id: value.id },
    include: { rows: true },
  });
  expect(restored.fetchedRowCount).toBe(101);
  expect(restored.costCents).toBe(3);
  expect(restored.rows).toHaveLength(1);
  expect(retainedBacklinksPage(restored)).toBeNull();
});
