import "server-only";
import { recordConnectionAccountFailure } from "@/lib/integrations/provider-recovery/account-failure";
import { accountHealthAdapter } from "@/lib/providers/account-health/registry";
import { formatQuantity, type Quantity } from "@usagekit/core";

export async function recordRankAccountResponse(input: {
  feature: string;
  provider: string;
  connectionId: string;
  projectId: string;
  credentialVersion: string | null;
  status: number;
  body: unknown;
  estimate?: readonly Quantity[];
}) {
  if (input.feature !== "rank_check") return;
  const adapter = accountHealthAdapter(input.provider);
  if (!adapter) return;
  const cents = input.estimate?.find((value) => value.unit === "cents");
  const minimumCapacity =
    adapter.capacity.unit === "searches"
      ? adapter.capacity.minimum({ searches: 1 })
      : adapter.capacity.minimum({
          estimatedCostUsd: cents ? Number(formatQuantity(cents)) / 100 : undefined,
        });
  await recordConnectionAccountFailure({
    connectionId: input.connectionId,
    projectId: input.projectId,
    provider: input.provider,
    credentialVersion: input.credentialVersion,
    httpStatus: input.status,
    minimumCapacity,
    capacityUnit: adapter.capacity.unit,
    fact: adapter.classify({
      status: input.status,
      body: input.body,
      scope: { kind: "capability", capability: "rank_check" },
    }),
  });
}
