import { LaunchRankCheckRunError } from "@/lib/rank-check/runs/launch-types";
import type { RunSelectionKeyword } from "@/lib/rank-check/runs/selection";
import { sameDefinitionBytes } from "./canonical";
import { hostDefinitionAdapter } from "./host-adapters";
import type { HostPolicySnapshot } from "./host-policy-contract";
import { hostPolicyBlock } from "./host-policy-contract";

/** Scope validation for the actual quoted rows; no historical head is fabricated for a first run. */
export function launchPolicyBlock(
  snapshot: HostPolicySnapshot,
  providerId: string | undefined,
  rows: readonly RunSelectionKeyword[],
  depths: readonly number[],
) {
  const block = hostPolicyBlock(snapshot);
  if (block) return block;
  if (!providerId) return null; // Existing no_provider vocabulary remains authoritative.
  const entry = hostDefinitionAdapter(providerId);
  const configured = snapshot.config?.adapters.find((adapter) => adapter.providerId === providerId);
  if (
    !entry ||
    !sameDefinitionBytes(entry.policy, configured) ||
    rows.length !== depths.length ||
    rows.some(
      (row, index) =>
        !entry.capability.devices.includes(row.device) ||
        !row.locationRef ||
        !entry.capability.locationKinds.includes(row.locationRef.kind) ||
        !entry.capability.depths.includes(depths[index]) ||
        depths[index] > entry.capability.maxDepth,
    )
  )
    return "measurement_policy_unsupported" as const;
  return null;
}
export function assertLaunchPolicy(...args: Parameters<typeof launchPolicyBlock>) {
  const reason = launchPolicyBlock(...args);
  if (reason) throw new LaunchRankCheckRunError(reason);
}
