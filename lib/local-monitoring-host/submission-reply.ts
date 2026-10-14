import type { SubmissionOutcome } from "@/lib/local-monitoring/execution-types";
import { submissionOutcomeSchema } from "@/lib/local-monitoring-store/schema";
import type { LocalSubmissionOutcome } from "@/lib/providers/local-search/contracts";
import { OriginalSubmitProofWriteError } from "./errors";

export function canonicalLocalSubmitReply(response: LocalSubmissionOutcome): SubmissionOutcome {
  return submissionOutcomeSchema.parse({
    acceptance: response.dispatchEvidenceVerified === true ? response.acceptance : "unknown",
    taskIds: [...response.taskIds],
    receivedAt: response.receivedAt,
    usage: {
      cached: response.usage.cached,
      costCents: response.usage.costCents,
      quantity: response.usage.quantity,
      failed: response.usage.failed,
      ...(response.usage.providerRequestId === undefined
        ? {}
        : { providerRequestId: response.usage.providerRequestId }),
    },
  });
}
export function onceOnlyCapturedLocalSubmit<Request>(input: {
  assertRequest(request: Request): void;
  submit(request: Request): Promise<LocalSubmissionOutcome>;
  retain(request: Request, outcome: SubmissionOutcome): Promise<unknown>;
}) {
  let attempted = false;
  let diagnostic: "not_received" | "unverified_response" | "retained" | "store_fallback_required" =
    "not_received";
  return {
    diagnostic: () => diagnostic,
    async submit(request: Request) {
      if (attempted) throw new Error("Original local submission already attempted.");
      attempted = true;
      input.assertRequest(request);
      const response = await input.submit(request);
      const outcome = canonicalLocalSubmitReply(response);
      if (response.dispatchEvidenceVerified !== true) {
        diagnostic = "unverified_response";
        return outcome;
      }
      try {
        await input.retain(request, outcome);
        diagnostic = "retained";
      } catch (cause) {
        if (!(cause instanceof OriginalSubmitProofWriteError)) throw cause;
        diagnostic = "store_fallback_required";
      }
      // Store still gets the exact validated reply if diagnostic persistence alone failed.
      return outcome;
    },
  };
}
