import { PrismaClient } from "@/lib/generated/prisma/client";
import { fixture } from "@/lib/metering/store/test-fixture";
import { timestampContractKey } from "@/lib/metering/store/timestamp-history";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, vi } from "vitest";
import { reservePaidAttempts } from "./admission";
import { input, paidFixture } from "./paid-attempt-test-fixture";
import { ensureProjectSpendingBudget } from "./project-budget-bootstrap";
import { setProjectSpendingLimit } from "./project-spending-limit";
import { putSpendingBudget, readSpendingBudgets } from "./spending-limit-store";
import {
  fundingSpendingBudgets,
  projectSpendingBudget,
  unresolvedSpendingGate,
} from "./spending-limits";
import { Prisma } from "./store/host-sql";

const actor = { id: "owner", memberships: [{ projectId: "project", role: "owner" as const }] };
const projectPublicId = "prj_abcdefghijklmnopqrstuvwx";

test.each(["project creation", "budget command"] as const)(
  "%s adopts a fresh ledger before budget access while pure reads remain unable to adopt",
  async (kind) => {
    const f = await fixture();
    const scopes = [{ kind: "group" as const, namespace: "test", group: "project" }];
    const run = <T>(body: (tx: Prisma.TransactionClient) => Promise<T>, readOnly = false) =>
      f.client().$transaction(async (tx) => {
        if (readOnly) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
        return body(tx);
      });
    try {
      // A migration-only database has none of the Store fixture's adoption metadata.
      await run(
        (tx) =>
          tx.$executeRaw`DELETE FROM metering_metadata WHERE key IN (${timestampContractKey},'bisibility.transport_fence_audit')`,
      );
      await expect(
        run((tx) => readSpendingBudgets(tx, "test", scopes, "read"), true),
      ).rejects.toThrow("read path requires prior UTC write adoption");
      expect(
        await run(
          (tx) =>
            tx.$queryRaw`SELECT value FROM metering_metadata WHERE key=${timestampContractKey}`,
        ),
      ).toEqual([]);
      await run(async (tx) => {
        if (kind === "project creation") await ensureProjectSpendingBudget(tx, "test", "project");
        else await putSpendingBudget(tx, projectSpendingBudget("test", "project", "100", 1));
      });
      const budgets = await f.store.listBudgets("test");
      expect(budgets).toHaveLength(1);
      expect(budgets[0]).toMatchObject({ id: "project:project:monthly", version: 1 });
      await run((tx) => ensureProjectSpendingBudget(tx, "test", "project"));
      expect(await f.store.listBudgets("test")).toEqual(budgets);
      expect(await run((tx) => readSpendingBudgets(tx, "test", scopes, "read"), true)).toEqual(
        budgets,
      );
    } finally {
      await f.close();
    }
  },
);

test("project cap commands persist alongside both funding budgets on initialized projects", async () => {
  const f = await paidFixture();
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: f.url }, { schema: f.schema }),
  });
  const run = <T>(body: Parameters<typeof f.run<T>>[0]) =>
    client.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(f.schema)}`);
      return body(tx);
    });
  try {
    await f.run(async (tx) => {
      await tx.$executeRaw`CREATE TABLE projects(id text PRIMARY KEY, "publicId" text, "isSample" boolean, "writeMode" text, "providerAllocationsInitializedAt" timestamptz, "budgetCapCents" int)`;
      await tx.$executeRaw`CREATE TABLE audit_logs(id text PRIMARY KEY DEFAULT md5(random()::text), "publicId" text, "actorId" text, "projectId" text, action text, "targetType" text, "targetId" text, before jsonb, after jsonb, "statusReason" text, "sourceIpHash" text, "sourceIpMasked" text, "userAgent" text, "correlationId" text, "appVersion" text, status text DEFAULT 'success', "createdAt" timestamptz DEFAULT now())`;
      await tx.$executeRaw`INSERT INTO projects VALUES('project',${projectPublicId},false,'active',now(),999)`;
      for (const funding of ["byok", "platform"] as const)
        for (const budget of fundingSpendingBudgets(
          "test",
          {
            id: "connection",
            provider: "dataforseo",
            unit: "cents",
            app: "10",
            programmatic: "10",
          },
          funding,
          1,
        ))
          await putSpendingBudget(tx, budget);
    });
    // This namespace is server configuration, never browser input.
    vi.stubEnv("METERING_NAMESPACE", "test");
    const write = (capCents: number) =>
      run((tx) => setProjectSpendingLimit(tx, { actor, projectPublicId, capCents }));
    expect(await write(1)).toEqual({ capCents: 1 });
    await f.restart();
    await expect(
      f.run((tx) => reservePaidAttempts(tx, [input()], f.options)),
    ).rejects.toMatchObject({
      outcome: { outcome: "exceeded", exceeded: { budget: { id: "project:project:monthly" } } },
    });
    expect(await write(10)).toEqual({ capCents: 10 });
    await f.run((tx) => reservePaidAttempts(tx, [input()], f.options));
    const status = await f.store.applicableBudgets({
      scope: input().reservation.scope,
      surface: "app",
      units: ["budget_cents"],
    });
    expect(status[0]?.reserved).toEqual({ unit: "budget_cents", value: 2n, scale: 0 });
    await write(1);
    const revised = await f.store.applicableBudgets({
      scope: input().reservation.scope,
      surface: "app",
      units: ["budget_cents"],
    });
    expect(revised[0]?.reserved).toEqual({ unit: "budget_cents", value: 2n, scale: 0 });
    expect(revised[0]?.budget.version).toBe(3);
    // Failure after the budget write rolls back the budget and audit together.
    await f.run(
      (tx) =>
        tx.$executeRaw`ALTER TABLE audit_logs ADD CONSTRAINT deny_audit CHECK (action IS NULL) NOT VALID`,
    );
    await expect(write(20)).rejects.toThrow();
    expect(
      (await f.store.listBudgets("test")).find((b) => b.unit === "budget_cents")?.version,
    ).toBe(3);
    expect(await f.run((tx) => tx.$queryRaw`SELECT "budgetCapCents" AS cap FROM projects`)).toEqual(
      [{ cap: 999 }],
    );
  } finally {
    vi.unstubAllEnvs();
    await client.$disconnect();
    await f.close();
  }
});

for (const kind of ["group", "connection"] as const)
  test(`public Store restores the persisted unknown-cost ${kind} gate after restart`, async () => {
    const f = await paidFixture();
    try {
      const scope =
        kind === "group"
          ? { kind, namespace: "test", group: "project" }
          : { kind, namespace: "test", connection: "connection" };
      await f.run((tx) =>
        putSpendingBudget(
          tx,
          unresolvedSpendingGate(scope, "migration", f.clock.now().toISOString(), 1),
        ),
      );
      await f.restart();
      await expect(
        f.run((tx) => reservePaidAttempts(tx, [input()], f.options)),
      ).rejects.toMatchObject({
        outcome: { outcome: "exceeded", exceeded: { budget: { unit: "paid_attempts" } } },
      });
      expect(await f.store.listBudgets("test")).toHaveLength(1);
    } finally {
      await f.close();
    }
  });
