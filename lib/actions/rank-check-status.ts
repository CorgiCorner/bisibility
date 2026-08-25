"use server";

import { AuthorizationError } from "@/lib/auth/authorize";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import { z } from "zod";
import { getActionActor, parseActionInput, requireKeywordScope } from "./_shared";

const getRankCheckStatusSchema = z.object({
  rankCheckId: z.string().trim().min(1).max(120),
});

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
