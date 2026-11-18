import type { MeterReserveInput } from "@usagekit/core";
import type { AssistantEffort } from "./effort";
import type { AssistantModel } from "./model-config";
import { estimateAssistantCost } from "./pricing";
import type { FundingMode } from "./wire";

/** UsageKit namespace for assistant attempts. It is not configurable. */
export const ASSISTANT_METERING_NAMESPACE = "assistant";

/** Values are server-owned identities already verified against the run and current membership. */
export type AssistantAccountingBinding = {
  namespace: string;
  ownerId: string;
  userId: string;
  projectId: string;
  runId: string;
  operationId: string;
  model: AssistantModel;
  funding: FundingMode;
  credentialId?: string;
  credentialVersion?: string;
  promptBytes: number;
  /** Effort stored on the run. Every effort shares the model's output cap, reasoning included. */
  effort?: AssistantEffort | null;
  /** 0 (or absent) for a step's first call; n for its n-th next platform key after a refusal. */
  keyAttempt?: number;
};

export function assistantReservation(binding: AssistantAccountingBinding): MeterReserveInput {
  const { model, funding } = binding;
  if (
    !binding.namespace ||
    !binding.ownerId ||
    !binding.userId ||
    !binding.projectId ||
    !binding.runId ||
    !binding.operationId
  )
    throw new Error("Incomplete assistant accounting binding");
  if (binding.promptBytes > model.contextChars)
    throw new Error("Assistant context exceeds model limit");
  if (funding === "byok" && (!binding.credentialId || !binding.credentialVersion))
    throw new Error("Invalid BYOK binding");
  if (funding === "credits" && (binding.credentialId || binding.credentialVersion))
    throw new Error("Invalid credits binding");
  return {
    operationId: binding.operationId,
    scope: {
      namespace: binding.namespace,
      principal: binding.ownerId,
      actor: binding.userId,
      group: binding.projectId,
      connection:
        funding === "byok" ? `byok:${binding.credentialId}` : `platform:${model.provider}`,
      accessCredential: { kind: "assistant_user", id: binding.userId },
      ...(binding.credentialVersion
        ? { providerCredentialVersion: binding.credentialVersion }
        : {}),
      ...(funding === "credits" ? { tags: [`assistant:project:${binding.projectId}`] } : {}),
    },
    fundingSource: funding === "byok" ? "byok" : "platform",
    ...(funding === "credits" ? { platformPools: [`provider:${model.provider}`, "global"] } : {}),
    costOwner: funding === "byok" ? binding.ownerId : "platform",
    surface: "app",
    source: "app",
    provider: model.provider,
    operation: model.id,
    providerPriceVersion: model.pricing.version,
    correlationId: binding.runId,
    parentOperationId: binding.runId,
    estimate: [
      {
        unit: "usd_micro",
        value: estimateAssistantCost(
          model.pricing,
          binding.promptBytes,
          model.maxOutputTokens,
          model.provider === "anthropic",
        ),
        scale: 0,
      },
      { unit: "requests", value: 1n, scale: 0 },
    ],
    reservationTtlMs: 120000,
  };
}
