import { extendedResult } from "./store-result.test-support";

export function routingCredentials() {
  return {
    version: 1 as const,
    completeness: "complete" as const,
    attempts: [{ outcome: "succeeded" as const, credentialSource: "gateway_system" as const }],
  };
}

export function provenanceResult() {
  const value = extendedResult();
  const cost = value.costEvidence;
  if (!cost) throw new Error("Missing test cost evidence");
  return {
    ...value,
    routingAttemptCredentials: routingCredentials(),
    costEvidence: {
      ...cost,
      upstreamInferenceDiscardReason: "inconsistent" as const,
    },
  };
}

const routing = routingCredentials();
export const invalidProvenance = [
  { routingAttemptCredentials: null },
  { routingAttemptCredentials: {} },
  { routingAttemptCredentials: { version: 1, attempts: [] } },
  { routingAttemptCredentials: { version: 1, completeness: "partial" } },
  { routingAttemptCredentials: { ...routing, attempts: {} } },
  { routingAttemptCredentials: { ...routing, version: 2 } },
  { routingAttemptCredentials: { ...routing, extra: true } },
  { routingAttemptCredentials: { ...routing, completeness: "exhaustive" } },
  { routingAttemptCredentials: { ...routing, attempts: [] } },
  { routingAttemptCredentials: { ...routing, attempts: Array(101).fill(routing.attempts[0]) } },
  ...[
    null,
    {},
    [],
    "system",
    { ...routing.attempts[0], extra: true },
    { outcome: "succeeded", credentialSource: "customer-secret" },
    { outcome: true, credentialSource: "gateway_system" },
    { outcome: "succeeded" },
    { credentialSource: "gateway_system" },
  ].map((attempt) => ({ routingAttemptCredentials: { ...routing, attempts: [attempt] } })),
  ...["provider said no", 1, false].map((reason) => ({
    costEvidence: { ...extendedResult().costEvidence, upstreamInferenceDiscardReason: reason },
  })),
];
