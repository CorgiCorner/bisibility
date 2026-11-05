import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { ensureProjectSpendingBudget } from "@/lib/metering/project-budget-bootstrap";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { createProviderRequestJournal } from "@/lib/provider-usage/request-journal";
import { buildProviderTag } from "@/lib/provider-usage/tag";
import { encryptSecret } from "@/lib/providers/crypto";

export const fixtureCredentials = { login: "owner@example.com", password: "fixture-secret" };

/** Disposable own-key queued task that was accepted but never got a recorded cost. */
export function costRecoveryFixture(db: PrismaClient, namespace: string) {
  const users: string[] = [],
    locations: string[] = [],
    projects: string[] = [];
  async function create(
    options: {
      costCents?: string | null;
      taskState?: string;
      envelope?: string;
      versionOverride?: string;
      providerTaskId?: string | null;
    } = {},
  ) {
    const envelope = options.envelope ?? encryptSecret(JSON.stringify(fixtureCredentials));
    const ownerId = randomUUID();
    users.push(ownerId);
    await db.user.create({
      data: {
        id: ownerId,
        publicId: makePublicId("usr"),
        name: "Cost recovery fixture",
        email: `${randomUUID()}@example.com`,
      },
    });
    const projectId = randomUUID();
    await db.$transaction(async (tx) => {
      await tx.project.create({
        data: {
          id: projectId,
          ownerId,
          publicId: makePublicId("prj"),
          name: "Cost recovery fixture",
          domain: `${randomUUID()}.example.com`,
        },
      });
      await ensureProjectSpendingBudget(tx, namespace, projectId);
    });
    projects.push(projectId);
    const connection = await db.providerConnection.create({
      data: {
        projectId,
        publicId: makePublicId("conn"),
        provider: "dataforseo",
        kind: "serp",
        credentialSource: "own",
        credentialsEncrypted: envelope,
        enabled: true,
        status: "connected",
      },
    });
    const location = await db.location.create({
      data: {
        kind: "country",
        displayName: "Cost recovery fixture",
        countryCode: "US",
        gl: "us",
        hl: "en",
        languageCode: "en",
        languageLabel: "English",
        primaryGeoName: "United States",
        secondaryGeoName: "United States",
        canonicalKey: randomUUID(),
      },
    });
    locations.push(location.id);
    const keyword = await db.keyword.create({
      data: {
        projectId,
        publicId: makePublicId("kw"),
        text: randomUUID(),
        location: "United States",
        locationId: location.id,
      },
    });
    const check = await db.rankCheck.create({
      data: {
        keywordId: keyword.id,
        publicId: makePublicId("check"),
        provider: "dataforseo",
        status: "failed",
      },
    });
    const batch = await db.queuedRankCheckBatch.create({
      data: {
        id: randomUUID(),
        projectId,
        connectionId: connection.id,
        priority: "normal",
        state: "failed",
        source: "worker",
        trigger: "scheduled",
        claimedAt: new Date(Date.now() - 7200000),
        submittedAt: new Date(Date.now() - 7200000),
        queueDeadlineAt: new Date(Date.now() - 3600000),
      },
    });
    const taskId = randomUUID();
    const nativeId = options.providerTaskId === undefined ? randomUUID() : options.providerTaskId;
    const context = {
      projectId,
      correlationId: taskId,
      source: "worker",
      trigger: "scheduled",
      feature: "rank_check",
    } as const;
    // The own-key form without a `cs` segment, exactly what current submissions store.
    const tag = buildProviderTag({ context, instanceSlug: "fixture", stage: "dev" });
    await db.queuedRankCheckTask.create({
      data: {
        id: taskId,
        batchId: batch.id,
        keywordId: keyword.id,
        rankCheckId: check.id,
        state: options.taskState ?? "failed",
        providerTaskId: nativeId,
        providerTag: tag,
        costCents: options.costCents ?? null,
      },
    });
    await db.instanceSetting.create({
      data: { key: `metering.shadow.project.${projectId}`, value: "on" },
    });
    const version =
      options.versionOverride ?? ownCredentialVersion("dataforseo", connection.id, envelope);
    const journal = createProviderRequestJournal(db, {
      attribution: { context, tag },
      projectId,
      connectionId: connection.id,
      keywordId: keyword.id,
      provider: "dataforseo",
      unit: "cents",
      credentialVersion: version,
      queued: true,
      estimate: { cents: "1.0000", units: "1.000000" },
    });
    const operationId = await journal.observer.begin({ attemptKey: randomUUID() });
    await journal.observer.beforeDispatch?.(operationId);
    return {
      ownerId,
      projectId,
      connectionId: connection.id,
      taskId,
      nativeId,
      operationId,
      envelope,
    };
  }
  async function cleanup() {
    for (const projectId of projects.splice(0)) {
      await db.instanceSetting.deleteMany({
        where: { key: `metering.shadow.project.${projectId}` },
      });
      await db.project.deleteMany({ where: { id: projectId } });
    }
    for (const id of locations.splice(0)) await db.location.delete({ where: { id } });
    for (const id of users.splice(0)) await db.user.delete({ where: { id } });
  }
  return { create, cleanup };
}
export type CostRecoveryCase = Awaited<
  ReturnType<ReturnType<typeof costRecoveryFixture>["create"]>
>;
