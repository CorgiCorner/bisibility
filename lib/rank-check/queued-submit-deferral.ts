import {
  type DeploymentAdmissionExhaustedError,
  OwnProviderKeyRequiredError,
} from "@/lib/providers/execution-extension-errors";

/** Own-key refusals keep their actionable message; the other refusals keep their reason codes. */
export function admissionDeferral(error: DeploymentAdmissionExhaustedError) {
  if (error instanceof OwnProviderKeyRequiredError) return error.message;
  return error.reason === "balance"
    ? "credits_exhausted"
    : `budget_exhausted:${error.surface ?? "app"}`;
}
