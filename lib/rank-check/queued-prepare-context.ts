import { keywordMembershipSelect } from "@/lib/keywords/membership-select";
import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { queuedDeploymentCredentialsAvailable } from "@/lib/providers/execution-extension";
import { resolveEffectiveSerpDepth } from "@/lib/serp/constants";
import type { QueuedRankCheckWorkflowInput } from "@/lib/temporal/queued-rank-check-contract";
import { serpProviderChainOrderBy } from "./provider-chain-order";
import { unrunnableBatchReason } from "./queued-eligibility";

export const AUTOMATIC_FREQUENCIES = new Set(["daily", "weekly", "monthly", "custom_cron"]);

export type PreparedKeyword = Awaited<ReturnType<typeof loadContext>>["keywords"][number];

export type EffectiveSchedule = {
  frequency: string;
  serpDepth: number | null;
};

export async function loadContext(
  tx: Prisma.TransactionClient,
  input: QueuedRankCheckWorkflowInput,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rank-check-budget:${input.projectId}`}))`;
  const project = await tx.project.findUnique({
    include: {
      defaults: true,
      owner: { select: { deactivatedAt: true } },
      providerConnections: {
        orderBy: serpProviderChainOrderBy(),
        where: { enabled: true, kind: "serp", status: "connected" },
      },
    },
    where: { id: input.projectId },
  });
  const keywords = await tx.keyword.findMany({
    include: {
      locationRef: true,
      rankChecks: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        where: { status: "completed" },
      },
      checkSchedule: { select: { ...keywordMembershipSelect, serpDepth: true } },
      schedule: true,
    },
    orderBy: { id: "asc" },
    where: { id: { in: input.keywordIds }, projectId: input.projectId },
  });
  if (!project) throw new Error("Queued rank-check project no longer exists.");
  if (keywords.length !== input.keywordIds.length) {
    throw new Error("Queued rank-check batch contains missing or duplicate keywords.");
  }
  const connection = project.providerConnections[0];
  let eligibilityReason = input.preflightDeferredReason ?? null;
  if (!eligibilityReason && (project.owner.deactivatedAt || project.writeMode !== "active")) {
    eligibilityReason = "Project state no longer permits scheduled rank checks.";
  }
  eligibilityReason ??= await unrunnableBatchReason(tx, input.projectId, keywords);
  if (!eligibilityReason && connection?.provider !== "dataforseo") {
    eligibilityReason = "DataForSEO is no longer the effective primary SERP provider.";
  }
  if (!eligibilityReason && connection) {
    try {
      if (connection.credentialSource === "hosted") {
        if (!(await queuedDeploymentCredentialsAvailable("dataforseo"))) {
          eligibilityReason = "DataForSEO credentials are unavailable.";
        }
      } else {
        const credentials = resolveProviderCredentials(
          connection.provider,
          connection.credentialsEncrypted,
        );
        if (!credentials.login || !credentials.password) {
          eligibilityReason = "DataForSEO credentials are unavailable.";
        }
      }
    } catch {
      eligibilityReason = "DataForSEO credentials are unavailable.";
    }
  }
  return { connection, eligibilityReason, keywords, project };
}

export function preparedKeyword(
  keyword: PreparedKeyword,
  defaults: EffectiveSchedule | null,
  verifiedRunItem = false,
) {
  const schedule = keyword.checkSchedule;
  if (
    !verifiedRunItem &&
    (!schedule ||
      !schedule.enabled ||
      schedule.archivedAt ||
      !AUTOMATIC_FREQUENCIES.has(schedule.frequency))
  )
    return null;
  const depth = resolveEffectiveSerpDepth({
    projectDepth: defaults?.serpDepth,
    checkScheduleDepth: keyword.checkSchedule?.serpDepth,
    scheduleDepth: keyword.schedule?.serpDepth,
  });
  return {
    depth,
    keyword: keyword.text,
  };
}
