import type { KillSwitchTripNotice } from "@/lib/assistant/kill-switch";
import type {
  AssistantErrorCode,
  AssistantProvider,
  FundingOptionView,
} from "@/lib/assistant/wire";
import type { Prisma } from "@/lib/generated/prisma/client";

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

export async function admitAssistantCreditAttempt(): Promise<never> {
  throw new Error("credits_unavailable");
}

export async function dispatchAssistantCreditAttempt(): Promise<never> {
  throw new Error("credits_unavailable");
}

export async function settleAssistantCreditAttempt(): Promise<never> {
  throw new Error("credits_unavailable");
}

export async function releaseAssistantCreditAttempt(): Promise<never> {
  throw new Error("credits_unavailable");
}

export async function closeUnknownAssistantCreditAttempt(..._unused: unknown[]): Promise<never> {
  throw new Error("credits_unavailable");
}

export async function chargeDeferredAssistantCreditAttempt(..._unused: unknown[]): Promise<never> {
  throw new Error("credits_unavailable");
}

export async function correctDeferredAssistantCreditAttempt(..._unused: unknown[]): Promise<never> {
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

export async function setAssistantProjectLimit(): Promise<never> {
  throw new Error("credits_unavailable");
}
