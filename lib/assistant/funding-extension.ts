import type { SettlementAuthority } from "@/lib/assistant/accounting-deferred";
import type { AssistantAccountingBinding } from "@/lib/assistant/accounting-scope";
import type { KillSwitchTripNotice } from "@/lib/assistant/kill-switch";
import type { AssistantModel } from "@/lib/assistant/model-config";
import type {
  AssistantErrorCode,
  AssistantProvider,
  FundingOptionView,
} from "@/lib/assistant/wire";
import type { Actor } from "@/lib/auth/authorize";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { PaidAttemptGrant, PaidAttemptReservation } from "@/lib/metering/paid-attempt-types";
import type { Lease, Operation, Quantity, SettleResult } from "@usagekit/core";
import type { Clock } from "@usagekit/store";

type Settlement = Extract<SettleResult, { outcome: "settled" }>;

export async function assertAssistantCreditsReady(
  _tx: Prisma.TransactionClient,
  _provider: AssistantProvider,
): Promise<AssistantErrorCode | null> {
  return "credits_unavailable";
}

export function assistantCreditsEnabled() {
  return false;
}

export async function creditsFundingOption(
  _userId: string,
  provider: AssistantProvider,
  _models: readonly AssistantModel[],
  _project: { id: string; ownerId: string },
): Promise<FundingOptionView> {
  return {
    mode: "credits",
    provider,
    available: false,
    reason: "credits_unavailable",
    usage: null,
    credential: null,
  };
}

export async function admitAssistantCreditAttempt(
  _tx: Prisma.TransactionClient,
  _binding: AssistantAccountingBinding,
  _step: number,
  _clock?: Clock,
): Promise<PaidAttemptReservation> {
  throw new Error("credits_unavailable");
}

export async function dispatchAssistantCreditAttempt(
  _tx: Prisma.TransactionClient,
  _binding: AssistantAccountingBinding,
  _operation: Operation,
  _holder: string,
  _clock?: Clock,
): Promise<PaidAttemptGrant> {
  throw new Error("credits_unavailable");
}

export async function settleAssistantCreditAttempt(
  _tx: Prisma.TransactionClient,
  _operation: Operation,
  _lease: Lease,
  _measuredMicro: bigint,
  _requestId: string | null,
  _usage: Prisma.InputJsonValue,
): Promise<Settlement> {
  throw new Error("credits_unavailable");
}

export async function releaseAssistantCreditAttempt(
  _tx: Prisma.TransactionClient,
  _operation: Operation,
  _reason: string,
  _clock?: Clock,
): Promise<void> {
  throw new Error("credits_unavailable");
}

export async function closeUnknownAssistantCreditAttempt(
  _tx: Prisma.TransactionClient,
  _input: {
    operation: Operation;
    leaseId: string;
    holdId: string;
    walletId: string;
    reason: string;
    authority?: "lease" | "recovery";
    rejected?: boolean;
  },
  _clock?: Clock,
): Promise<Settlement> {
  throw new Error("credits_unavailable");
}

export async function chargeDeferredAssistantCreditAttempt(
  _tx: Prisma.TransactionClient,
  _input: {
    operation: Operation;
    authority: SettlementAuthority;
    holdId: string;
    walletId: string;
    providerMicro: bigint;
    certainty: "measured" | "estimated";
    providerRequestId: string | null;
    evidenceRef: string;
  },
  _clock?: Clock,
): Promise<{ result: Settlement; chargedCents: Quantity; balanceAfterCents: Prisma.Decimal }> {
  throw new Error("credits_unavailable");
}

export async function correctDeferredAssistantCreditAttempt(
  _tx: Prisma.TransactionClient,
  _input: {
    operation: Operation;
    walletId: string;
    providerMicro: bigint;
    providerRequestId: string | null;
  },
  _clock?: Clock,
): Promise<{
  operation: Operation;
  wallet: {
    chargedCents: string;
    deltaCents: string;
    balanceAfterCents: string;
    applied: boolean;
  };
}> {
  throw new Error("credits_unavailable");
}

export async function readAssistantRunCharges(
  _runIds: readonly string[],
): Promise<Map<string, string>> {
  return new Map();
}

export async function readKillSwitchTripNotice(): Promise<KillSwitchTripNotice | null> {
  return null;
}

export async function hostedAssistantProviderKey(
  _provider: AssistantProvider,
  _options?: unknown,
): Promise<{ keyId: string; apiKey: string } | null> {
  return null;
}

export async function hasHostedAssistantProviderKey(
  _provider: AssistantProvider,
): Promise<boolean> {
  return false;
}

export async function hostedAssistantProviderKeyById(
  _provider: AssistantProvider,
  _keyId: string | null,
): Promise<string | null> {
  return null;
}

export async function recordHostedAssistantKeyOutcome(
  _keyId: string | null,
  _outcome: string,
): Promise<void> {}

export async function readAssistantProjectLimit(): Promise<{ limitCents: null; version: number }> {
  return { limitCents: null, version: 0 };
}

export async function setAssistantProjectLimit(
  _tx: Prisma.TransactionClient,
  _input: { actor: Actor; projectId: string; projectPublicId: string; capCents: number | null },
): Promise<{ capCents: number | null }> {
  throw new Error("credits_unavailable");
}
