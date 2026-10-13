import { PrismaClient } from "@/lib/generated/prisma/client";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test } from "vitest";
import {
  fencePaidAttemptsInTransaction,
  markPaidAttemptDispatch,
  reservePaidAttempts,
} from "./admission";
import { budget, input, nativeReceipt, paidFixture, required } from "./paid-attempt-test-fixture";
import { ensureProjectSpendingBudget } from "./project-budget-bootstrap";
import { settlePaidAttempt } from "./settlement";
import { Prisma } from "./store/host-sql";

test("public default BYOK binding admits without private tables and fences credential rotation", async () => {
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
      await tx.$executeRaw`CREATE TABLE projects(id text primary key, "ownerId" text, "budgetCapCents" int)`;
      await tx.$executeRaw`CREATE TABLE provider_connections(id text primary key, "projectId" text, "publicId" text, provider text, "credentialSource" text, enabled boolean, status text, "credentialsEncrypted" text)`;
      await tx.$executeRaw`INSERT INTO projects VALUES('project','owner',0)`;
      await ensureProjectSpendingBudget(tx, "test", "project");
      await tx.$executeRaw`INSERT INTO provider_connections VALUES('connection','project','public-connection','dataforseo','own',true,'connected','encrypted-envelope')`;
    });
    const version = required(
      ownCredentialVersion("dataforseo", "connection", "encrypted-envelope"),
    );
    const request = input();
    request.reservation.scope.providerCredentialVersion = version;
    request.context.providerCredentialVersion = version;
    const options = { clock: f.clock };
    await f.store.putBudget(budget("budget_cents", 1n));
    await f.store.putBudget(budget("cents", 10n, "connection"));
    await expect(run((tx) => reservePaidAttempts(tx, [request], options))).rejects.toMatchObject({
      outcome: { outcome: "exceeded", exceeded: { budget: { unit: "budget_cents" } } },
    });
    await f.store.putBudget({ ...budget("budget_cents", 10n), version: 2 });
    const [reserved] = await run((tx) => reservePaidAttempts(tx, [request], options));
    const grant = await run((tx) =>
      markPaidAttemptDispatch(tx, required(reserved), "worker", options),
    );
    await run((tx) => fencePaidAttemptsInTransaction(tx, [grant], options));
    const next = structuredClone(request);
    next.reservation.operationId = crypto.randomUUID();
    const [second] = await run((tx) => reservePaidAttempts(tx, [next], options));
    const secondGrant = await run((tx) =>
      markPaidAttemptDispatch(tx, required(second), "worker", options),
    );
    await f.run(
      (tx) =>
        tx.$executeRaw`UPDATE provider_connections SET "credentialsEncrypted"='rotated-envelope'`,
    );
    await expect(
      run((tx) => fencePaidAttemptsInTransaction(tx, [secondGrant], options)),
    ).rejects.toThrow("binding changed");
    // Only public tables exist. Business deletion leaves retained context and accounting intact.
    await f.run(async (tx) => {
      await tx.$executeRaw`DELETE FROM provider_connections`;
      await tx.$executeRaw`DELETE FROM projects`;
    });
    const settled = await run((tx) =>
      settlePaidAttempt(
        tx,
        {
          namespace: "test",
          principal: "owner",
          operationId: grant.operation.operationId,
          expectedVersion: grant.operation.version,
          commandId: "native",
          authority: { kind: "lease", leaseId: grant.lease.leaseId },
          receipt: nativeReceipt(),
        },
        options,
      ),
    );
    expect(settled.operation.state).toBe("settled");
    await expect(run((tx) => reservePaidAttempts(tx, [request], options))).rejects.toThrow(
      "binding changed",
    );
    expect(
      await f.run(
        (tx) =>
          tx.$queryRaw`SELECT context->>'projectId' AS project FROM metering_paid_attempt_context`,
      ),
    ).toEqual([{ project: "project" }, { project: "project" }]);
  } finally {
    await client.$disconnect();
    await f.close();
  }
});
