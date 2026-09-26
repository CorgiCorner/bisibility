import "server-only";

import { ApplicationFailure } from "@temporalio/common";
import { prisma } from "../db/prisma";
import { deferRunItemForBusyKeyword } from "../rank-check/runs/items";
import { isUniqueConstraintError } from "../rank-check/runs/launch-idempotency";

/**
 * A manual run may queue a keyword another run also holds. Whichever links second hits the
 * one-running-item-per-keyword index; that item is closed as deferred and the workflow stops
 * without retrying, instead of leaving the item queued and its run open forever.
 */
export async function throwIfRunItemKeywordBusy(
  error: unknown,
  input: { keywordId: string; runItemId?: string },
) {
  const runItemId = input.runItemId;
  if (!runItemId || !isUniqueConstraintError(error)) return;
  const deferred = await prisma.$transaction((tx) =>
    deferRunItemForBusyKeyword(tx, { keywordId: input.keywordId, now: new Date(), runItemId }),
  );
  if (!deferred) return;
  throw ApplicationFailure.create({
    message: "Another run is already checking this keyword.",
    nonRetryable: true,
    type: "rank_check_run_item_keyword_busy",
  });
}
