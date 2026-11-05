import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id";
import {
  closeoutPostgresFixture,
  liveCredentialEnvelope,
} from "@/lib/metering/history-closeout/postgres.test-fixture";
import { input } from "@/lib/metering/paid-attempt-test-fixture";
import { createPostgresStore } from "@/lib/metering/store";
import { saveBudget } from "@/lib/metering/store/budgets";
import { createSql } from "@/lib/metering/store/host-sql";
import { command } from "@/lib/metering/store/test-data";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { buildProviderTag } from "@/lib/provider-usage/tag";
import { unknownCloseoutPolicy } from "./manifest";
import { applyUnknownCloseout, previewUnknownCloseout } from "./service";

export const now = new Date("2026-10-28T12:00:00Z");
export async function unknownFixture() {
  const f = await closeoutPostgresFixture({ live: true });
  const namespace = `unknown-${randomUUID()}`;
  const connection = "live-liveowner";
  const version = ownCredentialVersion("dataforseo", connection, liveCredentialEnvelope)!;
  const store = await createPostgresStore({
    prisma: f.db,
    clock: { now: () => new Date(now.getTime() - 3600000) },
  });
  const location = await f.db.location.create({
    data: {
      kind: "country",
      displayName: "US",
      countryCode: "US",
      gl: "us",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "US",
      secondaryGeoName: "US",
      canonicalKey: "closeout-native",
    },
  });
  const keyword = await f.db.keyword.create({
    data: {
      publicId: makePublicId("kw"),
      projectId: "liveowner",
      text: "native closure fixture",
      location: "US",
      locationId: location.id,
    },
  });
  await f.db.$transaction((tx) =>
    saveBudget(createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 }), {
      id: "native-exposure",
      version: 1,
      scope: { kind: "connection", namespace, connection },
      surface: "any",
      unit: "requests",
      limit: null,
      onExceed: "block",
      window: { kind: "calendar_month", timezone: "UTC" },
    }),
  );
  let sequence = 0;
  type NativeOptions = {
    /** An accepted task keeps its native id and own-key tag; cost stays null like production. */
    accepted?: { providerTaskId?: string; taskState?: string; costCents?: string | null };
    version?: string;
  };
  async function native(options: NativeOptions = {}) {
    sequence++;
    const taskVersion = options.version ?? version;
    const id = randomUUID();
    const check = await f.db.rankCheck.create({
      data: {
        publicId: makePublicId("check"),
        keywordId: keyword.id,
        checkedAt: new Date(now.getTime() - 3600000 - sequence),
        provider: "dataforseo",
        status: options.accepted ? "failed" : "deferred",
      },
    });
    const batch = await f.db.queuedRankCheckBatch.create({
      data: {
        id,
        projectId: "liveowner",
        connectionId: connection,
        priority: "normal",
        state: "deferred",
        claimedAt: new Date(now.getTime() - 3600000),
        queueDeadlineAt: new Date(now.getTime() - 1800000),
        error: "HTTP 402",
      },
    });
    const task = await f.db.queuedRankCheckTask.create({
      data: {
        id: `task-${id}`,
        batchId: batch.id,
        keywordId: keyword.id,
        rankCheckId: check.id,
        state: options.accepted?.taskState ?? "deferred",
        ...(options.accepted
          ? {
              providerTaskId: options.accepted.providerTaskId ?? `native-${id}`,
              providerTag: buildProviderTag({
                context: {
                  projectId: "liveowner",
                  correlationId: `task-${id}`,
                  source: "worker",
                  trigger: "scheduled",
                  feature: "rank_check",
                },
                instanceSlug: "fixture",
                stage: "dev",
              }),
              costCents: options.accepted.costCents ?? null,
            }
          : {}),
      },
    });
    const request = input(id, connection).reservation;
    Object.assign(request.scope, {
      namespace,
      principal: "closeout-owner",
      group: "liveowner",
      providerCredentialVersion: taskVersion,
    });
    Object.assign(request, {
      costOwner: "closeout-owner",
      operation: "serp.google.organic.task_post",
      correlationId: task.id,
    });
    if (!request.estimate) throw new Error("Missing fixture estimate");
    const reserved = await store.reserve({ ...request, estimate: request.estimate });
    if (reserved.outcome !== "reserved") throw new Error("Fixture reserve refused");
    const dispatch = await store.markDispatchIntent({
      ...command(reserved.operation),
      holder: "original",
      leaseTtlMs: 60000,
    });
    if (!("granted" in dispatch) || !dispatch.granted) throw new Error("Fixture dispatch refused");
    await f.db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      await tx.meteringPaidAttemptContext.create({
        data: {
          namespace,
          operation_id: id,
          principal: "closeout-owner",
          dispatch_lease_id: dispatch.lease.leaseId,
          fenced_at: new Date(now.getTime() - 3600000),
          fenced_at_iso: new Date(now.getTime() - 3600000).toISOString(),
          context: { rankCheckId: check.id, providerCredentialVersion: taskVersion },
        },
      });
    });
    return {
      id,
      check,
      task,
      request,
      operation: dispatch.operation,
      manifest: {
        policy: unknownCloseoutPolicy,
        namespace,
        operator: f.operator,
        reason: "Owner accepts unknown original cost after evidence investigation",
        evidenceRef: "operator:fixture-native-review",
        recordedAt: now.toISOString(),
        operations: [{ operationId: id, expectedVersion: dispatch.operation.version }],
      },
    };
  }
  const preview = (value: unknown) =>
    f.db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        return previewUnknownCloseout(tx, value, now);
      },
      { isolationLevel: "RepeatableRead", timeout: 30000 },
    );
  const apply = (value: unknown, digest: string) =>
    f.db.$transaction((tx) => applyUnknownCloseout(tx, value, digest, now), {
      isolationLevel: "ReadCommitted",
      timeout: 30000,
    });
  return { ...f, namespace, connection, version, keyword, native, preview, apply, store };
}
