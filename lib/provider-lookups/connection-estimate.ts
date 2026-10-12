import "server-only";
import { prisma } from "@/lib/db/prisma";
import { loadNativeFeatureCostCents } from "@/lib/provider-rates/native-feature-quote";
import { requiredEstimatedCostCents } from "./paid-call-estimate";

export async function requiredConnectionEstimate(
  input: Parameters<typeof requiredEstimatedCostCents>[0] & {
    connection: { id: string; provider: string; credentialsEncrypted: string | null };
    feature: string;
  },
) {
  return (await loadNativeFeatureCostCents(prisma, input)) ?? requiredEstimatedCostCents(input);
}
