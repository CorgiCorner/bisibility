import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type {
  PlatformAllocationEvidence,
  ProviderUiAllocationScope,
} from "@/lib/provider-ui/allocation-extension-types";
import type { NativeProviderRate } from "@/lib/provider-ui/rates";
import type { ProviderRate } from "@usagekit/views";

/** Self-hosted provider UI has no deployment-owned wallet allocation capability. */
export async function platformAllocationProviders(
  _tx: Prisma.TransactionClient,
  _scope: ProviderUiAllocationScope,
): Promise<readonly string[]> {
  return [];
}
export async function platformAllocationEvidence(
  _tx: Prisma.TransactionClient,
  _scope: ProviderUiAllocationScope,
): Promise<readonly PlatformAllocationEvidence[]> {
  return [];
}

export async function platformConnectionRates(
  _tx: Prisma.TransactionClient,
  _provider: string,
  _rates: readonly NativeProviderRate[],
): Promise<ProviderRate[]> {
  return [];
}
