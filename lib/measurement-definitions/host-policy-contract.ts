import type { PersistedDefinitionPolicy } from "./model";
export type HostPolicyBlock = "measurement_policy_unconfigured" | "measurement_policy_unsupported";
export type HostPolicySnapshot = Readonly<{
  state: "ready" | "unconfigured" | "unsupported" | "authority_unavailable";
  policyEpoch: string | null;
  config: PersistedDefinitionPolicy | null;
}>;
export function hostPolicyBlock(snapshot: HostPolicySnapshot): HostPolicyBlock | null {
  return snapshot.state === "ready"
    ? null
    : snapshot.state === "unconfigured"
      ? "measurement_policy_unconfigured"
      : "measurement_policy_unsupported";
}
export type ConfigureHostPolicyInput = Readonly<{
  projectId: string;
  expectedPolicyEpoch: string;
  manualTtlMs: number | null;
  cadenceGraceMs: number | null;
  confirmed: true;
}>;
export type ConfigureHostPolicyResult =
  | Readonly<{ kind: "saved"; policyEpoch: string; changed: boolean; repreviewRequired: true }>
  | Readonly<{ kind: "conflict" }>
  | Readonly<{ kind: "unavailable" }>;
