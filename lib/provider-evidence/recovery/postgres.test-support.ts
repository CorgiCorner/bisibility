import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { key } from "@/lib/metering/store/codec";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { encryptSecret } from "@/lib/providers/crypto";
import { identityFixture } from "./fixture.test-support";

const fixtureUsers: string[] = [];
const fixtureLocations: string[] = [];
export const fixtureNamespace = `recovery-engine-${randomUUID()}`;
export async function recoveryFixture(
  options: {
    queued?: boolean;
    canonical?: boolean;
    hosted?: boolean;
    deadlineSeconds?: number;
    fenced?: boolean;
    state?: string;
    completed?: boolean;
    now?: Date;
  } = {},
) {
  const now = options.now ?? new Date();
  const id = randomUUID();
  const user = await prisma.user.create({
    data: { publicId: makePublicId("usr"), email: `${id}@example.test`, name: "Recovery fixture" },
  });
  fixtureUsers.push(user.id);
  const location = await prisma.location.create({
    data: {
      canonicalKey: `recovery-${id}`,
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
      gl: "us",
      hl: "en",
      countryCode: "US",
      displayName: "United States",
      kind: "country",
      languageCode: "en",
      languageLabel: "English",
    },
  });
  fixtureLocations.push(location.id);
  const project = await prisma.project.create({
    data: {
      publicId: makePublicId("prj"),
      ownerId: user.id,
      name: "Recovery fixture",
      domain: "example.test",
    },
  });
  const keyword = await prisma.keyword.create({
    data: {
      publicId: makePublicId("kw"),
      projectId: project.id,
      text: "fixture",
      location: "United States",
      locationId: location.id,
    },
  });
  const check = await prisma.rankCheck.create({
    data: {
      publicId: makePublicId("check"),
      keywordId: keyword.id,
      provider: options.completed ? "fallback" : "dataforseo",
      status: options.completed ? "completed" : "running",
      finishedAt: options.completed ? now : null,
      checkedAt: new Date(now.getTime() - 7200000),
      position: options.completed ? 7 : null,
    },
  });
  const connection = await prisma.providerConnection.create({
    data: {
      publicId: makePublicId("conn"),
      projectId: project.id,
      provider: "dataforseo",
      kind: "serp",
      status: "connected",
      credentialSource: "own",
      credentialsEncrypted: encryptSecret(
        JSON.stringify({ login: "fixture", password: "synthetic" }),
      ),
    },
  });
  const operationId = options.hosted ? `hosted-attempt:${id}` : `op-${id}`;
  const operationPk = options.canonical ? key(fixtureNamespace, operationId) : `recovery:${id}`;
  const attemptId = `attempt-${id}`;
  const operation = await prisma.meteringOperation.create({
    data: {
      operation_pk: operationPk,
      namespace: fixtureNamespace,
      principal: "original-principal",
      operation_id: operationId,
      state: options.state ?? "dispatch_intended",
      version: 1,
      semantic_hash: id,
      budget_epochs: {},
      reservation_expires_at: now,
      created_at: now,
      updated_at: now,
      input: {
        provider: "dataforseo",
        operation: "rank_check",
        scope: { connection: connection.id },
      },
      warnings: [],
      paidAttemptContext: {
        create: {
          principal: "original-principal",
          context: { rankCheckId: check.id },
          dispatch_lease_id: attemptId,
          submissionCompletedAt: options.queued ? now : null,
          fenced_at: options.fenced === false ? null : now,
          fenced_at_iso: options.fenced === false ? null : now.toISOString(),
        },
      },
    },
  });
  let queuedTaskId: string | null = null;
  if (options.queued) {
    const batch = await prisma.queuedRankCheckBatch.create({
      data: {
        id: `batch-${id}`,
        projectId: project.id,
        connectionId: connection.id,
        priority: "normal",
        state: "submitted",
        claimedAt: now,
        queueDeadlineAt: new Date(now.getTime() + (options.deadlineSeconds ?? 3600) * 1000),
      },
    });
    const task = await prisma.queuedRankCheckTask.create({
      data: {
        id: `task-${id}`,
        batchId: batch.id,
        keywordId: keyword.id,
        rankCheckId: check.id,
        state: "ready",
        providerTaskId: `native-${id}`,
      },
    });
    queuedTaskId = task.id;
  }
  const identity = await prisma.providerDispatchIdentity.create({
    data: identityFixture({
      operationPk,
      namespace: fixtureNamespace,
      projectId: project.id,
      connectionId: connection.id,
      payerAccountRef: connection.id,
      rankCheckId: check.id,
      keywordId: keyword.id,
      queuedTaskId,
      providerCredentialVersion: ownCredentialVersion(
        "dataforseo",
        connection.id,
        connection.credentialsEncrypted,
      )!,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 86400000),
      executionMode: options.queued ? "queued" : "live",
    }),
  });
  return {
    user,
    project,
    keyword,
    check,
    connection,
    operation,
    operationPk,
    operationId,
    attemptId,
    identity,
    now,
  };
}

export async function cleanRecoveryFixtures() {
  const operations = await prisma.meteringOperation.findMany({
    where: { namespace: fixtureNamespace },
    include: { providerDispatchIdentity: true },
  });
  const pks = operations.map((o) => o.operation_pk);
  const identities = operations.flatMap((o) =>
    o.providerDispatchIdentity ? [o.providerDispatchIdentity] : [],
  );
  await prisma.providerIncident.deleteMany({
    where: { operations: { some: { operationPk: { in: pks } } } },
  });
  await prisma.providerRecoveryProof.deleteMany({ where: { operationPk: { in: pks } } });
  await prisma.meteringCommand.deleteMany({ where: { operation_pk: { in: pks } } });
  await prisma.meteringEvent.deleteMany({ where: { operation_pk: { in: pks } } });
  await prisma.providerRecoveryIntent.deleteMany({ where: { operationPk: { in: pks } } });
  await prisma.providerRecoveryCandidate.deleteMany({ where: { operationPk: { in: pks } } });
  await prisma.providerOperationEvidence.deleteMany({ where: { operationPk: { in: pks } } });
  await prisma.providerDispatchIdentity.deleteMany({ where: { operationPk: { in: pks } } });
  await prisma.$executeRaw`DELETE FROM metering_history_import WHERE namespace=${fixtureNamespace}`;
  await prisma.meteringUsageEvidence.deleteMany({ where: { namespace: fixtureNamespace } });
  await prisma.meteringMeasurement.deleteMany({
    where: { receipt: { operation_pk: { in: pks } } },
  });
  await prisma.meteringReceipt.deleteMany({ where: { operation_pk: { in: pks } } });
  await prisma.meteringPaidAttemptContext.deleteMany({ where: { namespace: fixtureNamespace } });
  await prisma.meteringOperation.deleteMany({ where: { namespace: fixtureNamespace } });
  await prisma.meteringMetadata.deleteMany({
    where: { key: { startsWith: `provider-recovery-historical:${fixtureNamespace}:` } },
  });
  await prisma.meteringBudgetUsage.deleteMany({ where: { namespace: fixtureNamespace } });
  await prisma.meteringBudget.deleteMany({ where: { namespace: fixtureNamespace } });
  for (const identity of identities) {
    const project = await prisma.project.findUnique({ where: { id: identity.projectId } });
    await prisma.project.deleteMany({ where: { id: identity.projectId } });
    if (project) await prisma.user.deleteMany({ where: { id: project.ownerId } });
  }
  for (const userId of fixtureUsers.splice(0)) {
    await prisma.project.deleteMany({ where: { ownerId: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.location.deleteMany({ where: { id: { in: fixtureLocations.splice(0) } } });
}

export async function protectedRecoverySnapshot() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname='public' AND
    (tablename LIKE 'metering_%' OR tablename LIKE '%authorit%' OR tablename LIKE '%fence%' OR tablename LIKE '%dispatch%' OR tablename LIKE '%grant%' OR tablename LIKE '%gate%' OR tablename LIKE '%execution_bindings%' OR
     tablename LIKE 'credit_%' OR tablename LIKE 'hosted_%' OR tablename LIKE 'notification%')
    ORDER BY tablename`;
  const context = await prisma.meteringPaidAttemptContext.findMany({
    select: {
      namespace: true,
      operation_id: true,
      principal: true,
      context: true,
      dispatch_lease_id: true,
      fenced_at: true,
      fenced_at_iso: true,
      debit_id: true,
    },
    orderBy: [{ namespace: "asc" }, { operation_id: "asc" }],
  });
  return {
    context,
    tables: Object.fromEntries(
      await Promise.all(
        tables
          .filter((t) => t.tablename !== "metering_paid_attempt_context")
          .map(async ({ tablename }) => {
            if (!/^[a-z_]+$/.test(tablename)) throw new Error("Unexpected table name");
            const rows = await prisma.$queryRawUnsafe<Array<{ body: unknown }>>(
              `SELECT to_jsonb(t) AS body FROM "${tablename}" t ORDER BY to_jsonb(t)::text`,
            );
            return [tablename, rows];
          }),
      ),
    ),
  };
}
