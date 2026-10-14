import "server-only";
import type { LocalResultBinding } from "@/lib/local-monitor-results/binding";
import type { LocalFinancialState } from "@/lib/local-monitoring-host/projection";
import {
  localCanonicalFinancialState,
  terminalLocalProofReplay,
} from "@/lib/local-monitoring-store/acceptance-proof";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { assertLocalCustody } from "@/lib/local-monitoring-store/custody";
import { LocalMeasurementConflictError } from "@/lib/local-monitoring-store/errors";
import { readDiscardedLocalRelease } from "@/lib/local-monitoring-store/released-read";
import { PaidOperationUnavailableError } from "@/lib/metering/transaction-meter";
import { monitorRetryEligibility } from "./eligibility";

/** Reads original canonical custody. Status labels alone never authorize a second purchase. */
export async function readMonitorRetryProof(
  tx: LocalTransaction,
  row: LocalResultBinding["rows"][number],
) {
  const owners = await tx.localMeasurementTargetOwner.findMany({
    where: { projectId: row.item.projectId, itemId: row.item.id },
    select: { itemId: true },
  });
  const preliminary = monitorRetryEligibility({
    record: row.record,
    financialState: null,
    ownerRetained: owners.length > 0,
    nativeProof: null,
  });
  if (preliminary.reason !== "accounting_pending")
    return { ...preliminary, financialState: null, nativeProof: null };
  let financialState: LocalFinancialState = null;
  let nativeProof: "proven_rejected" | "proven_unsent" | null = null;
  try {
    financialState = await readDiscardedLocalRelease(tx, row.item, row.record);
    if (financialState !== null) nativeProof = "proven_unsent";
    else {
      const id = await assertLocalCustody(tx, row.item, row.record);
      financialState = await localCanonicalFinancialState(tx, id);
      if (row.record.status === "rejected" && (await terminalLocalProofReplay(tx, id, row.record)))
        nativeProof = "proven_rejected";
    }
  } catch (error) {
    if (
      !(
        error instanceof PaidOperationUnavailableError ||
        error instanceof LocalMeasurementConflictError
      )
    )
      throw error;
    financialState = "unavailable";
  }
  return {
    ...monitorRetryEligibility({
      record: row.record,
      financialState,
      ownerRetained: owners.length > 0,
      nativeProof,
    }),
    financialState,
    nativeProof,
  };
}
