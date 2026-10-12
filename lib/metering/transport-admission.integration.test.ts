import { PrismaClient } from "@/lib/generated/prisma/client";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import { beginProviderTaskset } from "@/lib/provider-usage/batch-request-journal";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import { readObservedResponse } from "@/lib/providers/usage";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Receipt } from "@usagekit/core";
import { expect, test, vi } from "vitest";
import { budget, paidFixture, required } from "./paid-attempt-test-fixture";
import { ensureProjectSpendingBudget } from "./project-budget-bootstrap";

// Self-host native retention uses the accounting receipt history alone.
vi.mock("./transport-proof-extension", () => ({
  retainNativeProof: async (_tx: unknown, _owner: unknown, receipt: Receipt) => receipt,
  readNativeProof: async () => null,
}));

async function transportFixture() {
  const f = await paidFixture();
  const url = new URL(f.url);
  url.searchParams.set("options", `-c search_path=${f.schema}`);
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString() }, { schema: f.schema }),
  });
  await f.run(async (tx) => {
    await tx.$executeRaw`CREATE TABLE projects(id text primary key, "ownerId" text, "budgetCapCents" int)`;
    await tx.$executeRaw`CREATE TABLE provider_connections(id text primary key, "projectId" text, "publicId" text, provider text, "credentialSource" text, enabled boolean, status text, "credentialsEncrypted" text)`;
    await tx.$executeRaw`CREATE TABLE keywords(id text primary key, "projectId" text)`;
    await tx.$executeRaw`CREATE TABLE rank_checks(id text primary key, "keywordId" text, "runId" text)`;
    await tx.$executeRaw`ALTER TABLE queued_rank_check_tasks ADD COLUMN "rankCheckId" text`;
    await tx.$executeRaw`INSERT INTO projects VALUES('project','owner',0)`;
    await ensureProjectSpendingBudget(tx, "test", "project");
    await tx.$executeRaw`INSERT INTO provider_connections VALUES('connection','project','public-connection','dataforseo','own',true,'connected','encrypted-envelope')`;
  });
  vi.stubEnv("METERING_NAMESPACE", "test");
  const input = (correlationId = "correlation") => ({
    projectId: "project",
    connectionId: "connection",
    provider: "dataforseo",
    unit: "cents" as const,
    credentialVersion: required(
      ownCredentialVersion("dataforseo", "connection", "encrypted-envelope"),
    ),
    estimate: { cents: "2.0000", units: "1.000000" },
    attribution: {
      tag: "not-retained",
      context: {
        projectId: "project",
        correlationId,
        feature: "rank_check" as const,
        source: "app" as const,
        trigger: "manual" as const,
      },
    },
  });
  return {
    ...f,
    db,
    input,
    close: async () => {
      vi.unstubAllEnvs();
      await db.$disconnect();
      await f.close();
    },
  };
}

for (const bound of ["project", "connection-unknown", "project-unknown"] as const) {
  test(`actual public transport refuses ${bound} before HTTP without any private or legacy tables`, async () => {
    const f = await transportFixture();
    try {
      await f.store.putBudget(budget("cents", 100n, "connection"));
      await f.store.putBudget(
        bound === "project"
          ? budget("budget_cents", 1n)
          : {
              ...budget(
                "paid_attempts",
                0n,
                bound === "connection-unknown" ? "connection" : "group",
              ),
              window: {
                kind: "since_reset",
                epoch: "unresolved",
                startsAt: new Date().toISOString(),
              },
            },
      );
      const journal = createProviderRequestJournal(f.db, f.input());
      const request = vi.fn(async () => new Response("{}"));
      await expect(
        readObservedResponse({
          observer: journal.observer,
          request,
          measure: () => ({ costCents: 2, quantity: 1, cached: false, failed: false }),
        }),
      ).rejects.toMatchObject({
        name:
          bound === "project" || bound === "project-unknown"
            ? "BudgetExhaustedError"
            : "ProviderAllocationExhaustedError",
      });
      expect(request).not.toHaveBeenCalled();
      expect(await f.db.meteringUsageEvidence.count()).toBe(0);
    } finally {
      await f.close();
    }
  });
}

test("public journal reserves, fences and settles without activation or legacy ledger writes", async () => {
  const f = await transportFixture();
  try {
    const journal = createProviderRequestJournal(f.db, f.input());
    let sent = 0;
    await readObservedResponse({
      observer: journal.observer,
      request: async () => {
        sent++;
        return new Response("{}");
      },
      measure: () => ({
        costCents: 2,
        quantity: 1,
        cached: false,
        failed: false,
        providerRequestId: "native-id",
      }),
    });
    expect(sent).toBe(1);
    expect(journal.costCents).toBe(2);
    const evidence = await f.db.meteringUsageEvidence.findFirstOrThrow();
    const operation = await f.store.getOperation({
      namespace: "test",
      principal: "owner",
      operationId: evidence.id,
    });
    expect(operation?.state).toBe("settled");
    expect(operation?.receipts.at(-1)?.measurements).toContainEqual(
      expect.objectContaining({
        unit: "budget_cents",
        quantity: { unit: "budget_cents", value: 20000n, scale: 4 },
      }),
    );
    await expect(journal.observer.beforeDispatch?.(evidence.id)).rejects.toThrow();
    expect(sent).toBe(1);
  } finally {
    await f.close();
  }
});

test("queued taskset denial rolls back every shared child before the batch POST", async () => {
  const f = await transportFixture();
  try {
    await f.store.putBudget(budget("budget_cents", 3n));
    await expect(
      beginProviderTaskset(f.db, [
        { ...f.input("a"), keywordId: "keyword-a" },
        { ...f.input("b"), keywordId: "keyword-b" },
      ]),
    ).rejects.toMatchObject({ name: "BudgetExhaustedError" });
    expect(await f.db.meteringUsageEvidence.count()).toBe(0);
  } finally {
    await f.close();
  }
});

test("unknown live proof keeps its reservation and forbids paid retry", async () => {
  const f = await transportFixture();
  try {
    const taskset = await beginProviderTaskset(f.db, [{ ...f.input(), keywordId: "keyword" }]);
    await ownAdmission.fence(f.db, taskset.grants);
    const id = taskset.identities[0].id;
    await expect(ownAdmission.fence(f.db, taskset.grants)).rejects.toThrow();
    await expect(f.db.$transaction((tx) => ownAdmission.cancel(tx, [id]))).rejects.toThrow();
  } finally {
    await f.close();
  }
});

test("free retrieval cannot turn a duplicate into its own canonical receipt or erase a paid cost", async () => {
  const f = await transportFixture();
  try {
    const receipt = {
      costCents: 2,
      quantity: 1,
      cached: false,
      failed: false,
      providerRequestId: "native-replay",
    };
    for (const correlation of ["original", "duplicate"]) {
      const journal = createProviderRequestJournal(f.db, f.input(correlation));
      await readObservedResponse({
        observer: journal.observer,
        request: async () => new Response("{}"),
        measure: () => receipt,
      });
    }
    const original = await f.db.meteringUsageEvidence.findFirstOrThrow({
      where: { correlationId: "original" },
    });
    await f.db.$transaction((tx) =>
      ownAdmission.recover(tx, "connection", "original", { ...receipt, costCents: 0 }),
    );
    const operation = await f.store.getOperation({
      namespace: "test",
      principal: "owner",
      operationId: original.id,
    });
    expect(operation?.receipts.at(-1)?.cost.money?.units).toBe(20000n);
    expect(
      (await f.db.meteringUsageEvidence.findUniqueOrThrow({ where: { id: original.id } }))
        .canonicalId,
    ).toBeNull();
  } finally {
    await f.close();
  }
});
