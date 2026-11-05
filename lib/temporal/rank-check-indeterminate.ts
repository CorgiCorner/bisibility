import "server-only";
import { ApplicationFailure } from "@temporalio/common";
import { prisma } from "../db/prisma";
import { OrganicCoverageError } from "../providers/serp/organic-coverage-error";
import { UnresolvedRedirectError } from "../providers/serp/unresolved-redirect-error";
import { RankCheckRunnerError } from "../rank-check/runner-error";

export const PROVIDER_UNRESOLVED_REDIRECTS_FAILURE = "provider_unresolved_redirects";

/** Retain the reason and stop automatic retries of an already returned indeterminate result. */
export async function indeterminateRankFailure(error: unknown, rankCheckId: string) {
  if (!(error instanceof RankCheckRunnerError)) return null;
  const code =
    error.cause instanceof OrganicCoverageError
      ? error.cause.code
      : error.cause instanceof UnresolvedRedirectError
        ? PROVIDER_UNRESOLVED_REDIRECTS_FAILURE
        : null;
  if (!code) return null;
  await prisma.rankCheck.updateMany({
    where: { id: rankCheckId, status: "running" },
    data: { errorCode: code },
  });
  return ApplicationFailure.create({
    message: error.message,
    nonRetryable: true,
    type: code,
  });
}
