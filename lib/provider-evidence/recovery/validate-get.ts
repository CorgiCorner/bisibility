import type { ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import type { RecoveryGet } from "./adapter";
import { recoveryAdapters } from "./registry";
import type { RetainedSubmission } from "./submission";

/** A retained native id permits absent metadata, never contradictory metadata. */
export function validateRecoveryGet(
  identity: ProviderDispatchIdentity,
  submission: RetainedSubmission,
  outcome: RecoveryGet,
  adapter = recoveryAdapters.get(identity.provider),
) {
  if (outcome.kind !== "evidence") return outcome;
  for (const task of outcome.tasks) {
    if (
      task.submittedPayload &&
      adapter?.matchTask(identity.nativeTag ?? "", submission, [
        {
          id: task.id ?? "",
          endpointPath: identity.endpointPath,
          tag: typeof task.submittedPayload.tag === "string" ? task.submittedPayload.tag : null,
          metadata: task.submittedPayload,
          costCents: task.costCents,
          function: null,
          datetimePosted: null,
          datetimeDone: null,
        },
      ])?.kind !== "match"
    )
      return { kind: "operator_review" as const, reason: "returned_task_payload_conflict" };
  }
  return outcome;
}
