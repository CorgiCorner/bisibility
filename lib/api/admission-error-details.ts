import type { Actor } from "@/lib/auth/authorize";
import {
  type AdmissionErrorDetails,
  loadAdmissionErrorDetails,
} from "@/lib/providers/admission-error-details";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import { ProviderChainError } from "@/lib/rank-check/provider-chain-error";
import type { ApiContext } from "./context";

function balanceAdmission(error: unknown): DeploymentAdmissionExhaustedError | null {
  const admission = error instanceof ProviderChainError ? error.admissionExhaustion : error;
  return admission instanceof DeploymentAdmissionExhaustedError && admission.reason === "balance"
    ? admission
    : null;
}

/** Enrich only after the API router has authenticated and resolved its project scope. */
export async function apiAdmissionErrorDetails(
  error: unknown,
  ctx: Pick<ApiContext, "actorId" | "auth">,
): Promise<AdmissionErrorDetails | null> {
  const admission = balanceAdmission(error);
  if (!admission?.projectId || admission.projectId !== ctx.auth.project.id) return null;
  try {
    const details = await loadAdmissionErrorDetails(
      admission.projectId,
      ctx.auth.project.publicId,
      ctx.actorId ?? null,
    );
    return details && ctx.actorId == null ? { ...details, balance_cents: null } : details;
  } catch {
    return null;
  }
}

/** Session app handlers already have a trusted user actor, but no API project scope. */
export async function appAdmissionErrorDetails(
  error: unknown,
  actor: Actor | null,
): Promise<AdmissionErrorDetails | null> {
  const admission = balanceAdmission(error);
  if (!admission?.projectId || !actor) return null;
  try {
    return await loadAdmissionErrorDetails(admission.projectId, null, actor.id);
  } catch {
    return null;
  }
}
