import "server-only";

import { randomUUID } from "node:crypto";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { assertDefinitionActor } from "@/lib/measurement-definitions/access";
import { captureSnapshotDefinition } from "@/lib/measurement-definitions/snapshot-binding";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import {
  SNAPSHOT_EXTENSION_LEASE_MS,
  SNAPSHOT_EXTENSION_WINDOW_MS,
  type SnapshotExtensionState,
} from "./snapshot-extension";
import { snapshotExtensionWasNotSent } from "./snapshot-extension-proof";
import {
  readSnapshotContinuation,
  readSnapshotExtension,
  snapshotExtensionView,
} from "./snapshot-extension-state";

export async function claimSnapshotExtension(input: {
  actorId: string;
  checkId: string;
  nextStart: number;
  projectId: string;
  payment?: ActionPaymentReceipt;
}) {
  return prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, input.projectId);
    await assertDefinitionActor(tx, input.actorId, input.projectId, "update");
    const project = await tx.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, writeMode: true },
    });
    if (!project) throw new Error("Project not found.");
    assertProjectWritable(project);
    const check = await tx.rankCheck.findFirst({
      where: {
        publicId: input.checkId,
        keyword: { projectId: input.projectId },
        status: "completed",
      },
      select: {
        id: true,
        publicId: true,
        raw: true,
        provider: true,
        keywordId: true,
        keyword: { select: { publicId: true } },
      },
    });
    if (!check) throw new Error("Snapshot not found.");
    if (!Array.isArray((check.raw as Prisma.JsonObject | null)?.organic_results))
      return { ok: false as const, reason: "legacy" as const };
    const eligibility = snapshotExtensionView(check.provider, check.raw);
    if (eligibility.reason !== "available") {
      const unsent =
        eligibility.reason === "failed" &&
        (await snapshotExtensionWasNotSent(tx, input.projectId, check).catch(() => false));
      if (!unsent) return { ok: false as const, reason: eligibility.reason };
      const captured = readSnapshotContinuation(check.raw);
      const age = captured ? Date.now() - Date.parse(captured.capturedAt) : Infinity;
      if (age < 0 || age >= SNAPSHOT_EXTENSION_WINDOW_MS)
        return { ok: false as const, reason: "expired" as const };
    }
    const context = readSnapshotContinuation(check.raw);
    const state = context && readSnapshotExtension(check.raw, context);
    if (!context || !state || state.nextStart !== input.nextStart)
      return { ok: false as const, reason: "unavailable" as const };
    const connection = await tx.providerConnection.findFirst({
      where: {
        id: context.connectionId,
        projectId: input.projectId,
        provider: "serpapi",
        kind: "serp",
        credentialSource: { in: ["own", "hosted"] },
        status: "connected",
        enabled: true,
      },
      select: { id: true, credentialSource: true },
    });
    if (!connection) return { ok: false as const, reason: "disconnected" as const };
    const requestId = randomUUID();
    const claimed: SnapshotExtensionState = {
      ...state,
      ...(input.payment ? { payment: input.payment } : {}),
      state: "running",
      requestId,
      leaseUntil: new Date(Date.now() + SNAPSHOT_EXTENSION_LEASE_MS).toISOString(),
    };
    const raw = check.raw as Prisma.JsonObject;
    const updated = await tx.rankCheck.updateMany({
      where: { id: check.id, raw: { equals: raw } },
      data: { raw: { ...raw, snapshotExtension: claimed } as unknown as Prisma.InputJsonObject },
    });
    if (updated.count !== 1) return { ok: false as const, reason: "running" as const };
    const definition = await captureSnapshotDefinition(tx, {
      id: requestId,
      actorId: input.actorId,
      projectId: input.projectId,
      keywordId: check.keywordId,
      rankCheckId: check.id,
      context,
      state: claimed,
      credentialSource: connection.credentialSource === "hosted" ? "hosted" : "own",
    });
    await writeAudit(
      {
        action: "rank_check.snapshot_extend",
        actorId: input.actorId,
        projectId: input.projectId,
        targetId: check.publicId,
        targetType: "rank_check",
        after: { keywordId: check.keyword.publicId, start: state.nextStart, status: "running" },
      },
      tx,
    );
    return { ok: true as const, check, context, state: claimed, raw, requestId, definition };
  });
}

export type SnapshotExtensionClaim = Extract<
  Awaited<ReturnType<typeof claimSnapshotExtension>>,
  { ok: true }
>;

export async function finishSnapshotExtension(input: {
  actorId: string;
  projectId: string;
  claim: SnapshotExtensionClaim;
  state: SnapshotExtensionState;
}) {
  const { claim } = input;
  return prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, input.projectId);
    let state = input.state;
    if (state.state === "failed") {
      const current = await tx.rankCheck.findFirst({
        where: { id: claim.check.id, keyword: { projectId: input.projectId }, status: "completed" },
        select: { id: true, keywordId: true, provider: true, raw: true },
      });
      if (
        current &&
        (await snapshotExtensionWasNotSent(tx, input.projectId, current, claim.requestId).catch(
          () => false,
        ))
      )
        state = { ...state, state: "retryable" };
    }
    const saved = await tx.rankCheck.updateMany({
      where: {
        id: claim.check.id,
        keyword: { projectId: input.projectId },
        raw: { path: ["snapshotExtension", "requestId"], equals: claim.requestId },
      },
      data: {
        raw: { ...claim.raw, snapshotExtension: state } as unknown as Prisma.InputJsonObject,
      },
    });
    if (saved.count !== 1) throw new Error("Snapshot changed before the extension was saved.");
    const page = state.pages.at(-1);
    await writeAudit(
      {
        action: "rank_check.snapshot_extend",
        actorId: input.actorId,
        projectId: input.projectId,
        targetId: claim.check.publicId,
        targetType: "rank_check",
        after: {
          keywordId: claim.check.keyword.publicId,
          start: claim.state.nextStart,
          status: state.state,
          fetchedAt: page?.fetchedAt,
          addedResults: page?.rows.length,
          skippedDuplicates: page?.skippedDuplicates,
        },
      },
      tx,
    );
    return { state: state.state };
  });
}
