import "server-only";
import type { ModelAdmissionPorts } from "@/lib/model-playground/admission";
import type { ModelPaymentDatabase } from "@/lib/model-playground/admission-storage";
import type { ModelUsageObserver } from "@/lib/providers/model/types";
import { recordModelDispatchEvidence } from "./model-accounting";
import { beforeModelDispatch } from "./model-dispatch";

export { recordModelDispatchEvidence } from "./model-accounting";
export { ModelDispatchRefusal } from "./model-dispatch";

/** Native accounting cannot turn a paid response into a transport failure. */
export function createModelRequestJournal(
  db: ModelPaymentDatabase,
  ports: ModelAdmissionPorts,
): ModelUsageObserver {
  return {
    beforeDispatch: (id) => beforeModelDispatch(db, ports, id),
    async settle(id, response, interruption) {
      try {
        await recordModelDispatchEvidence(db, id, response, undefined, interruption);
      } catch {
        // Storage can be unavailable too. Keep the paid answer and its transport fence.
        console.error("Model accounting recovery required", { attemptId: id });
      }
    },
  };
}
