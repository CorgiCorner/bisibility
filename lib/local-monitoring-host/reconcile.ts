import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { LocalDatabase, LocalStoreContext } from "@/lib/local-monitoring-store/context";
import type { LocalContinuationLease } from "@/lib/local-monitoring-store/continuation-lease";
import { reconcileLocalMeasurementItem } from "@/lib/local-monitoring-store/recovery";
import { OriginalSubmitProofUnavailableError } from "./errors";
import { createOriginalLocalProofPort } from "./proof-loader";

export async function reconcileLocalHostItem(
  command: unknown,
  context: LocalStoreContext,
  lease: LocalContinuationLease,
  clock: () => Date,
  db: LocalDatabase = prisma,
) {
  const source = createOriginalLocalProofPort(db, clock);
  try {
    const result = await reconcileLocalMeasurementItem(
      command,
      context,
      lease,
      clock,
      db,
      source.port,
    );
    return { ...result, providerEvidence: source.evidence() };
  } catch (cause) {
    if (!(cause instanceof OriginalSubmitProofUnavailableError)) throw cause;
    // The Store rechecks current authority and the same lease; this path never prepares or sends.
    const result = await reconcileLocalMeasurementItem(command, context, lease, clock, db);
    return { ...result, providerEvidence: "missing_original_submit_evidence" as const };
  }
}
