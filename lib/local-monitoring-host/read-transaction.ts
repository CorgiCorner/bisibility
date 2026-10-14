import "server-only";
import { localCanonicalFinancialState } from "@/lib/local-monitoring-store/acceptance-proof";
import type { LocalProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { assertLocalCustody } from "@/lib/local-monitoring-store/custody";
import { LocalMeasurementUnavailableError } from "@/lib/local-monitoring-store/errors";
import { readDiscardedLocalRelease } from "@/lib/local-monitoring-store/released-read";
import { submissionRecordSchema } from "@/lib/local-monitoring-store/schema";
import { PaidOperationUnavailableError } from "@/lib/metering/transaction-meter";
import { type LocalFinancialState, projectLocalHostItem } from "./projection";
import type { LocalHostRunReadCommand } from "./read-schema";

/** Caller owns fresh project authorization and the read snapshot; custody/financial semantics stay shared. */
export async function readLocalHostRunInTransaction(
  tx: LocalTransaction,
  data: LocalHostRunReadCommand,
  scope: LocalProjectScope,
) {
  const run = await tx.localMeasurementRun.findFirst({
    where: { projectId: scope.project.id, publicId: data.runId },
  });
  if (
    !run ||
    !run.expectedTargetKeys.length ||
    run.expectedTargetKeys.length > 100 ||
    new Set(run.expectedTargetKeys).size !== run.expectedTargetKeys.length
  )
    throw new LocalMeasurementUnavailableError();
  const rows = await tx.localMeasurementRunItem.findMany({
    where: { projectId: scope.project.id, runId: run.id },
    orderBy: { operationKey: "asc" },
    take: 101,
  });
  if (rows.length !== run.expectedTargetKeys.length) throw new LocalMeasurementUnavailableError();
  const targets = await tx.localMeasurementTarget.findMany({
    where: { projectId: scope.project.id, id: { in: rows.map((row) => row.targetId) } },
    select: { id: true, publicId: true, targetKey: true },
  });
  const targetMap = new Map(targets.map((target) => [target.id, target]));
  const owners = await tx.localMeasurementTargetOwner.findMany({
    where: { projectId: scope.project.id, itemId: { in: rows.map((row) => row.id) } },
    select: { itemId: true },
  });
  const retained = new Set(owners.map((owner) => owner.itemId));
  const items = [];
  for (const row of rows) {
    const record = submissionRecordSchema.parse(row.record);
    const target = targetMap.get(row.targetId);
    if (
      !target ||
      record.version !== row.version ||
      record.key !== row.operationKey ||
      record.scope.projectId !== scope.project.id ||
      record.targetKey !== target.targetKey ||
      !run.expectedTargetKeys.includes(record.targetKey)
    )
      throw new LocalMeasurementUnavailableError();
    let financialState: LocalFinancialState = null;
    try {
      financialState = await readDiscardedLocalRelease(tx, row, record);
      if (financialState === null) {
        const id = await assertLocalCustody(tx, row, record);
        financialState = await localCanonicalFinancialState(tx, id);
      }
    } catch (cause) {
      if (!(cause instanceof PaidOperationUnavailableError)) throw cause;
      financialState = "unavailable";
    }
    items.push({
      targetId: target.publicId,
      ...projectLocalHostItem(record, financialState, retained.has(row.id)),
    });
  }
  return {
    id: run.publicId,
    version: run.version,
    cancellationRequested: run.cancellationRequested,
    expectedCount: run.expectedTargetKeys.length,
    items,
    counts: {
      items: items.length,
      complete: items.filter((item) => item.resolution === "complete").length,
      acceptanceUnresolved: items.filter(
        (item) => item.acceptance === "unknown" || item.status === "unknown_acceptance",
      ).length,
      accountingPending: items.filter((item) => item.accountingPending).length,
      unavailable: items.filter((item) => item.financialState === "unavailable").length,
      retainedOwners: items.filter((item) => item.ownerRetained).length,
    },
  };
}
