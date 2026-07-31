import type { OrganicResultAnomalyCode, OrganicResultDecision } from "./organic-result-decision";

type DeterminateOrganicResultDecision = Exclude<
  OrganicResultDecision,
  { outcome: "indeterminate" }
>;

export class ProviderPayloadContractError extends Error {
  readonly anomalyCodes: OrganicResultAnomalyCode[];

  constructor(
    provider: string,
    decision: Extract<OrganicResultDecision, { outcome: "indeterminate" }>,
  ) {
    const anomalyCodes = [...new Set(decision.anomalies.map((anomaly) => anomaly.code))];
    super(
      `${provider} organic payload is indeterminate${
        anomalyCodes.length ? `: ${anomalyCodes.join(", ")}` : "."
      }`,
    );
    this.name = "ProviderPayloadContractError";
    this.anomalyCodes = anomalyCodes;
  }
}

export function requireDeterminateOrganicResult(
  provider: string,
  decision: OrganicResultDecision,
): DeterminateOrganicResultDecision {
  if (decision.outcome === "indeterminate") {
    throw new ProviderPayloadContractError(provider, decision);
  }
  return decision;
}
