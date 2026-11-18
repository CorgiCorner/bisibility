import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { PaidAttemptInput } from "@/lib/metering/paid-attempt-types";
import type { ModelAttempt, ModelPaymentDatabase } from "@/lib/model-playground/admission-storage";
import type { ModelFundingSettlementInput } from "@/lib/model-playground/funding-contract";
import { ModelAdmissionRefusal, type ModelPaymentQuote } from "@/lib/model-playground/payment";
import type { ModelUsageBinding } from "@/lib/model-playground/usage-contract";

export async function maintainModelFunding(_db: ModelPaymentDatabase) {
  return { checked: 0, corrected: 0 };
}

/** Self-hosted installations never grant a platform-funded request. */
export async function assertModelFundingBinding(
  _tx: Prisma.TransactionClient,
  binding: ModelUsageBinding,
  _actorId?: string,
) {
  if (binding.fundingSource !== "byok") throw new ModelAdmissionRefusal("connection_unavailable");
}

export async function reserveModelFunding(
  tx: Prisma.TransactionClient,
  quote: ModelPaymentQuote,
  inputs: readonly PaidAttemptInput[],
  _now: Date,
): Promise<PaidAttemptInput[]> {
  for (const { binding } of quote.context.columns) await assertModelFundingBinding(tx, binding);
  return [...inputs];
}

export async function dispatchModelFunding(
  tx: Prisma.TransactionClient,
  attempt: ModelAttempt,
  _now: Date,
) {
  await assertModelFundingBinding(tx, attempt.binding);
}

export const releaseModelFunding = dispatchModelFunding;

export async function settleModelFunding(
  tx: Prisma.TransactionClient,
  input: ModelFundingSettlementInput,
): Promise<null> {
  await assertModelFundingBinding(tx, input.attempt.binding);
  return null;
}

export async function resolveModelFundingConnection(
  _db: ModelPaymentDatabase,
  _projectId: string,
  _request: import("@/lib/model-playground/catalog-request").ModelPlaygroundCatalogRequest,
  _context: { actorId?: string; source?: import("@/lib/provider-usage/tag").ProviderRequestSource },
): Promise<import("@/lib/model-playground/connection-resolution").ModelConnectionResolution> {
  throw new ModelAdmissionRefusal("connection_unavailable");
}
export async function peekModelFundingCatalog(
  _db: ModelPaymentDatabase,
  _projectId: string,
  _request: import("@/lib/model-playground/catalog-request").ModelPlaygroundCatalogRequest,
  _context: { actorId?: string; source?: import("@/lib/provider-usage/tag").ProviderRequestSource },
): Promise<import("@/lib/providers/model/types").ModelCatalogSnapshot | null> {
  return null;
}
export async function recheckModelFundingConnection(
  _tx: Prisma.TransactionClient,
  _projectId: string,
  _request: import("@/lib/model-playground/catalog-request").ModelPlaygroundCatalogRequest,
  _connection: import("@/lib/model-playground/connection-resolution").ModelConnectionResolution,
  _actorId?: string,
  _source?: import("@/lib/provider-usage/tag").ProviderRequestSource,
) {
  throw new ModelAdmissionRefusal("connection_unavailable");
}
export async function modelFundingValuation(
  _tx: Prisma.TransactionClient,
  _column: import("@/lib/model-playground/types").ModelColumn,
  _input: import("@/lib/model-playground/types").ModelPlaygroundInput,
  _connection: import("@/lib/model-playground/connection-resolution").ModelConnectionResolution,
): Promise<import("@/lib/model-playground/funding-contract").ModelFundingValuation | null> {
  return null;
}

export async function modelFundingConnections(
  _db: ModelPaymentDatabase,
  _projectId: string,
  _actorId: string,
  connections: readonly import("@/lib/integrations/types").IntegrationProviderData[],
) {
  return connections;
}

export async function modelFundingEstimate(
  _tx: Prisma.TransactionClient,
  _column: import("@/lib/model-playground/types").ModelColumn,
  _input: import("@/lib/model-playground/types").ModelPlaygroundInput,
): Promise<import("@/lib/model-playground/types").ModelMoney> {
  throw new ModelAdmissionRefusal("connection_unavailable");
}

export async function reconcileModelFundingEvidence(
  _db: import("@/lib/model-playground/admission-storage").ModelPaymentDatabase,
  _id: string,
  _response: import("@/lib/model-playground/types").ModelColumnResult,
) {
  return false;
}
