import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { RankCheckClaimCompensation } from "./dispatcher-types";

const MAX_COMPENSATION_CLAIMS = 500;

type CompensationDatabase = Pick<Prisma.TransactionClient, "$queryRaw">;

type ParsedClaim = {
  advancedCheckAt: Date;
  dueCheckAt: Date;
  keywordId: string;
  stateVersion: string;
};

function parseClaim(claim: RankCheckClaimCompensation): ParsedClaim {
  const advancedCheckAt = new Date(claim.advancedCheckAt);
  const dueCheckAt = new Date(claim.dueCheckAt);
  if (
    !claim.keywordId ||
    !/^[0-9]+$/.test(claim.stateVersion) ||
    !Number.isFinite(advancedCheckAt.getTime()) ||
    !Number.isFinite(dueCheckAt.getTime()) ||
    advancedCheckAt <= dueCheckAt
  ) {
    throw new Error("Dispatcher compensation requires valid claim IDs and ordered timestamps.");
  }
  return {
    advancedCheckAt,
    dueCheckAt,
    keywordId: claim.keywordId,
    stateVersion: claim.stateVersion,
  };
}

export async function compensateFailedRankCheckClaims(
  input: { claims: RankCheckClaimCompensation[] },
  database: CompensationDatabase = prisma,
) {
  if (input.claims.length < 1 || input.claims.length > MAX_COMPENSATION_CLAIMS) {
    throw new Error("Dispatcher compensation must contain a bounded non-empty claim set.");
  }
  const uniqueKeywordIds = new Set(input.claims.map((claim) => claim.keywordId));
  if (uniqueKeywordIds.size !== input.claims.length) {
    throw new Error("Dispatcher compensation claims must have unique keyword IDs.");
  }
  const claims = input.claims.map(parseClaim);
  const values = Prisma.join(
    claims.map((claim) => {
      return Prisma.sql`(
        ${claim.keywordId}::text,
        ${claim.dueCheckAt}::timestamp(3),
        ${claim.advancedCheckAt}::timestamp(3),
        ${claim.stateVersion}::text
      )`;
    }),
  );
  const restored = await database.$queryRaw<Array<{ keywordId: string }>>(Prisma.sql`
    UPDATE "keyword_dispatch_states" state
    SET "nextCheckAt" = failed."dueCheckAt"
    FROM (
      VALUES ${values}
    ) AS failed("keywordId", "dueCheckAt", "advancedCheckAt", "stateVersion")
    WHERE state."keywordId" = failed."keywordId"
      AND state."nextCheckAt" = failed."advancedCheckAt"
      AND state.xmin::text = failed."stateVersion"
    RETURNING state."keywordId"
  `);
  return {
    requested: claims.length,
    restored: restored.length,
    stale: claims.length - restored.length,
  };
}
