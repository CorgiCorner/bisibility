import {
  MODEL_ROUTING_ATTEMPT_LIMIT,
  type ModelRoutingAttemptCredentials,
} from "@/lib/providers/model/transport-contract";
import { record } from "./usage";

/** Routing metadata has no documented guarantee of exhaustive request coverage. */
export function routingAttemptCredentials(
  routing: Record<string, unknown>,
): ModelRoutingAttemptCredentials {
  const models = routing.modelAttempts;
  const attempts: ModelRoutingAttemptCredentials["attempts"] = [];
  if (!Array.isArray(models)) return { version: 1, completeness: "unknown", attempts };
  for (const value of models) {
    const model = record(value);
    const providers = model.providerAttempts;
    if (!Array.isArray(providers)) continue;
    for (const value of providers) {
      const provider = record(value);
      const outcome =
        provider.success === true ? "succeeded" : provider.success === false ? "failed" : "unknown";
      if (attempts.length === MODEL_ROUTING_ATTEMPT_LIMIT) continue;
      attempts.push({
        outcome,
        credentialSource:
          provider.credentialType === "system"
            ? "gateway_system"
            : provider.credentialType === "byok"
              ? "customer_upstream"
              : "unknown",
      });
    }
  }
  return { version: 1, completeness: "partial", attempts };
}
