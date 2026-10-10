import "server-only";
import { agentReportSchema } from "@/lib/agent-reports/model";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import { assertProjectWritable } from "@/lib/deployment/project-write-mode";
import type { AgentReport, Prisma } from "@/lib/generated/prisma/client";
import { syncUsageEntry } from "@/lib/metering/entry-sync";
import { settleLateNoDispatch, settleNoDispatchInTransaction } from "./no-dispatch-settlement";
import type { AiResearchContext, AiResearchOutcome } from "./service";
import type { AiResearchResult } from "./types";
import { AiResearchValidationError } from "./validation";

async function reconciled(
  tx: Prisma.TransactionClient,
  row: AgentReport,
  settled: Set<string>,
): Promise<AgentReport> {
  const provenance = row.provenance as Record<string, unknown>;
  const state = provenance.actualCostState;
  const noDispatchTags = provenance.noDispatchTags;
  if (
    typeof provenance.connectionId === "string" &&
    Array.isArray(noDispatchTags) &&
    noDispatchTags.length <= 2 &&
    noDispatchTags.every((tag) => typeof tag === "string")
  ) {
    for (const id of await settleNoDispatchInTransaction(tx, {
      projectId: row.projectId,
      connectionId: provenance.connectionId,
      tags: noDispatchTags,
    }))
      settled.add(id);
  }
  if (state !== "unknown" && state !== "pending") return row;
  if (
    state === "pending" &&
    (!Number.isFinite(provenance.executionDeadlineAt) ||
      Number(provenance.executionDeadlineAt) >= Date.now())
  )
    return row;
  const tags = provenance.usageTags;
  if (
    state === "pending" &&
    Array.isArray(tags) &&
    tags.length === 0 &&
    Array.isArray(noDispatchTags) &&
    noDispatchTags.length > 0 &&
    noDispatchTags.length <= 2 &&
    noDispatchTags.every((tag) => typeof tag === "string")
  )
    return tx.agentReport.update({
      where: { id: row.id },
      data: {
        provenance: { ...provenance, actualCostState: "refused" } as Prisma.InputJsonObject,
        body: {
          ...(row.body as Prisma.InputJsonObject),
          result: {
            ...(row.body as unknown as { result: AiResearchResult }).result,
            costCents: 0,
            costStatus: "confirmed",
            failure:
              "This attempt was refused before any paid dispatch. No provider charge was incurred.",
          },
        } as Prisma.InputJsonObject,
      },
    });
  if (
    !Array.isArray(tags) ||
    tags.length === 0 ||
    tags.length > 2 ||
    tags.some((tag) => typeof tag !== "string")
  )
    return row;
  if (typeof provenance.connectionId !== "string") return row;
  const receipts = await tx.providerCostEntry.findMany({
    where: {
      projectId: row.projectId,
      connectionId: provenance.connectionId,
      provider: "dataforseo",
      feature: "prompt_explorer",
      credentialSource: "own",
      tag: { in: tags },
    },
  });
  if (
    tags.some((tag) => !receipts.some((receipt) => receipt.tag === tag)) ||
    receipts.some(
      (receipt) =>
        receipt.measurementStatus !== "recorded" ||
        !Number.isFinite(Number(receipt.costCents)) ||
        Number(receipt.costCents) < 0 ||
        receipt.usageQuantity === null,
    )
  )
    return row;
  const body = row.body as unknown as { result: AiResearchResult };
  const result = {
    ...body.result,
    costCents: receipts.reduce((sum, receipt) => sum + Number(receipt.costCents), 0),
    costStatus: "confirmed",
    failure:
      "Provider usage was reconciled from recorded receipts. No provider request was retried.",
  };
  const parsed = agentReportSchema.parse(
    JSON.parse(
      JSON.stringify({
        kind: row.kind,
        title: row.title,
        body: { ...(row.body as object), result },
        provenance: {
          ...provenance,
          actualCostState: "confirmed",
          reconciledAt: new Date().toISOString(),
          providerRequestIds: receipts.map((receipt) => receipt.providerRequestId).filter(Boolean),
        },
      }),
    ),
  );
  return tx.agentReport.update({
    where: { id: row.id },
    data: { body: parsed.body, provenance: parsed.provenance },
  });
}

export function actualCostReplay(row: AgentReport): AiResearchOutcome {
  const state = (row.provenance as Record<string, unknown>).actualCostState;
  if (state !== "confirmed")
    return {
      ok: false,
      reason: state === "refused" ? "request_already_refused" : "usage_reconciliation_required",
      message:
        "This request cannot dispatch again. Review its saved report and provider usage before creating another attempt.",
      retryBlocked: state !== "refused",
      safeToStartNewRequest: state === "refused",
    };
  return {
    ok: true,
    estimate: false,
    cached: true,
    reportId: row.publicId,
    costCents: 0,
    result: (row.body as unknown as { result: AiResearchResult }).result,
    retryBlocked: false,
  };
}

export async function checkActualCostAttempt({
  context,
  connectionId,
  id,
  binding,
  payload,
}: {
  context: AiResearchContext;
  connectionId: string;
  id: string;
  binding: string;
  payload?: ReturnType<typeof agentReportSchema.parse>;
}) {
  const settled = new Set<string>();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai-actual:${context.projectId}`}))`;
    for (const settledId of await settleLateNoDispatch(tx, context.projectId, connectionId))
      settled.add(settledId);
    const existing = await tx.agentReport.findUnique({ where: { id } });
    if (existing) {
      if (
        existing.projectId !== context.projectId ||
        (existing.body as Record<string, unknown>).requestBinding !== binding
      )
        throw new AiResearchValidationError(
          "idempotency_conflict",
          "This request ID is already bound to different inputs or an advisory limit. It cannot dispatch again.",
        );
      return { created: false, row: await reconciled(tx, existing, settled) };
    }
    const unresolved = await tx.agentReport.findMany({
      where: {
        projectId: context.projectId,
        kind: "prompt_explorer",
        OR: ["pending", "unknown"].map((state) => ({
          provenance: { path: ["actualCostState"], equals: state },
        })),
      },
      take: 10,
    });
    if (unresolved.length >= 10)
      throw new AiResearchValidationError(
        "usage_reconciliation_required",
        "Too many unresolved requests require operator review.",
      );
    for (const row of unresolved) {
      const resolved = await reconciled(tx, row, settled);
      if (
        !["confirmed", "refused"].includes(
          String((resolved.provenance as Record<string, unknown>).actualCostState),
        )
      )
        throw new AiResearchValidationError(
          "usage_reconciliation_required",
          "An earlier actual-cost request is pending or has an unknown cost. Review and reconcile provider usage before another paid attempt, even with a new request ID.",
        );
    }
    if (!payload) return null;
    const project = await tx.project.findUniqueOrThrow({
      where: { id: context.projectId },
      select: { id: true, writeMode: true },
    });
    assertProjectWritable(project);
    return {
      created: true,
      row: await tx.agentReport.create({
        data: {
          ...payload,
          id,
          publicId: makePublicId("agr"),
          projectId: context.projectId,
          createdById: context.actorId ?? null,
        },
      }),
    };
  });
  await Promise.all([...settled].map((id) => syncUsageEntry(id)));
  return result;
}
