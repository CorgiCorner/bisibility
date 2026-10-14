import "server-only";
import type { Operation } from "@usagekit/core";
import type { LocalTransaction } from "./context";
import { LocalMeasurementConflictError } from "./errors";

/** Recognize the maintained Meter cancellation command, never infer no-send from an amount or timeout. */
export async function nativeUnsentTerminalState(
  tx: LocalTransaction,
  operation: Pick<Operation, "state" | "lease" | "receipts" | "operationId" | "scope">,
) {
  if (operation.state === "released") return "released" as const;
  if (operation.state !== "settled") throw new LocalMeasurementConflictError();
  const id = `no-send:${operation.operationId}`;
  const receipt = operation.receipts[0];
  if (
    operation.state !== "settled" ||
    operation.lease !== null ||
    operation.receipts.length !== 1 ||
    !receipt ||
    receipt.id !== id ||
    receipt.evidenceRef !== id ||
    receipt.supersedes ||
    receipt.providerRequestId ||
    (receipt.source && receipt.source !== "dispatch") ||
    receipt.cached !== false ||
    receipt.failed !== true ||
    receipt.cost.certainty !== "measured" ||
    receipt.cost.money.units !== 0n ||
    receipt.measurements.length === 0 ||
    receipt.measurements.some(
      (m) =>
        m.certainty !== "measured" ||
        (m.unit === "paid_attempts"
          ? m.quantity.value !== 1n || m.quantity.scale !== 0
          : m.quantity.value !== 0n),
    )
  )
    throw new LocalMeasurementConflictError();
  const rows = await tx.$queryRaw<Array<{ found: boolean }>>`
    SELECT EXISTS(
      SELECT 1 FROM metering_command c JOIN metering_operation o USING(operation_pk)
      WHERE o.namespace=${operation.scope.namespace} AND o.operation_id=${operation.operationId}
        AND o.principal=${operation.scope.principal} AND c.command_id='paid:no-send'
        AND c.kind='settle' AND c.result->>'outcome'='settled'
        AND c.input->>'namespace'=o.namespace AND c.input->>'operationId'=o.operation_id
        AND c.input->>'principal'=o.principal AND c.input->'receipt'->>'id'=${id}
    ) AS found`;
  if (rows.length !== 1 || rows[0].found !== true) throw new LocalMeasurementConflictError();
  return "settled" as const;
}
