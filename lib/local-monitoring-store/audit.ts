import { writeAudit } from "@/lib/auth/audit";
import type { LocalProjectScope } from "./access";
import type { LocalTransaction } from "./context";
export function auditLocal(
  tx: LocalTransaction,
  scope: LocalProjectScope,
  input: {
    action:
      | "local_measurement.target_create"
      | "local_measurement.launch"
      | "local_measurement.cancel"
      | "local_measurement.reconcile"
      | "local_measurement.collect"
      | "local_measurement.lease_claim";
    targetId: string;
    targetType: "local_measurement_target" | "local_measurement_run";
    after: {
      state?: string;
      version?: number;
      count?: number;
      bodyHash?: string;
      keyHash?: string;
      quoteHash?: string;
      targetKeyHash?: string;
    };
  },
) {
  return writeAudit(
    {
      ...input,
      actorId: scope.actor.id,
      projectId: scope.project.id,
      requestContext: scope.context.requestContext,
    },
    tx,
  );
}
