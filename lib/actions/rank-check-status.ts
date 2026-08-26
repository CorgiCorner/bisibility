"use server";

import { AuthorizationError } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { z } from "zod";
import {
  getActionActor,
  ProjectNotFoundError,
  parseActionInput,
  requireKeywordScope,
  requireProjectScope,
} from "./_shared";

const rankCheckIdSchema = z.string().trim().min(1).max(120);
const getRankCheckStatusSchema = z.object({ rankCheckId: rankCheckIdSchema });
const getRankCheckStatusesSchema = z.object({
  projectId: z.string().trim().min(1).max(120),
  rankCheckIds: z.array(rankCheckIdSchema).min(1).max(100),
});
const RANK_CHECK_QUERY_CHUNK_SIZE = 100;

export type GetRankCheckStatusResult = {
  status: string;
  errorCode: string | null;
  error: string | null;
  position: number | null;
  requestedDepth: number | null;
  finishedAt: string | null;
};

export async function getRankCheckStatus(input: unknown): Promise<GetRankCheckStatusResult> {
  const data = parseActionInput(getRankCheckStatusSchema, input);
  const actor = await getActionActor();
  const parsed = parsePublicId(data.rankCheckId);
  if (parsed?.prefix !== "check") {
    throw new Error("Rank check not found.");
  }
  const rankCheck = await prisma.rankCheck.findUnique({
    select: {
      error: true,
      errorCode: true,
      finishedAt: true,
      position: true,
      requestedDepth: true,
      status: true,
      keyword: { select: { publicId: true } },
    },
    where: { publicId: data.rankCheckId },
  });
  if (!rankCheck) {
    throw new Error("Rank check not found.");
  }
  // Enforce the same project visibility boundary as runCheckNow: a valid run
  // from another project must be rejected before status data is returned.
  try {
    await requireKeywordScope(actor, "read", rankCheck.keyword.publicId, {
      allowReadOnly: true,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      throw new Error("Rank check not found.");
    }
    throw error;
  }
  return {
    error: rankCheck.error,
    errorCode: rankCheck.errorCode,
    finishedAt: rankCheck.finishedAt?.toISOString() ?? null,
    position: rankCheck.position,
    requestedDepth: rankCheck.requestedDepth,
    status: rankCheck.status,
  };
}

export type GetRankCheckStatusesResult = GetRankCheckStatusResult & { rankCheckId: string };

export async function getRankCheckStatuses(input: unknown): Promise<GetRankCheckStatusesResult[]> {
  let data: z.infer<typeof getRankCheckStatusesSchema>;
  try {
    data = parseActionInput(getRankCheckStatusesSchema, input);
  } catch {
    throw new Error("Rank checks not found.");
  }
  if (data.rankCheckIds.some((id) => parsePublicId(id)?.prefix !== "check")) {
    throw new Error("Rank checks not found.");
  }
  const actor = await getActionActor();
  const project = await requireProjectScope(
    actor,
    "read",
    data.projectId,
    { type: "project" },
    { allowReadOnly: true },
  ).catch((error: unknown) => {
    if (error instanceof AuthorizationError || error instanceof ProjectNotFoundError) {
      throw new Error("Rank checks not found.");
    }
    throw error;
  });
  const ids = [...new Set(data.rankCheckIds)];
  const rankChecks = [];
  for (let offset = 0; offset < ids.length; offset += RANK_CHECK_QUERY_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + RANK_CHECK_QUERY_CHUNK_SIZE);
    const rows = await prisma.rankCheck.findMany({
      select: {
        error: true,
        errorCode: true,
        finishedAt: true,
        position: true,
        publicId: true,
        requestedDepth: true,
        status: true,
      },
      where: { keyword: { projectId: project.id }, publicId: { in: chunk } },
    });
    rankChecks.push(...rows);
  }
  return rankChecks.map((rankCheck) => ({
    error: rankCheck.error,
    errorCode: rankCheck.errorCode,
    finishedAt: rankCheck.finishedAt?.toISOString() ?? null,
    position: rankCheck.position,
    rankCheckId: rankCheck.publicId,
    requestedDepth: rankCheck.requestedDepth,
    status: rankCheck.status,
  }));
}
