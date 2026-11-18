import { resolveAssistantFunding } from "@/lib/assistant/funding-resolve";
import { ASSISTANT_PROVIDERS, type AssistantConfigView } from "@/lib/assistant/wire";
import type { BillingConnection } from "./ProviderBillingCard";

/** Report connected funding sources, including AI keys outside the integration catalog. */
export function withAiBillingConnections(
  connections: readonly BillingConnection[],
  config: AssistantConfigView,
): BillingConnection[] {
  const ai = new Set<string>(ASSISTANT_PROVIDERS);
  const result = connections.filter((item) => !ai.has(item.providerId));
  for (const provider of ASSISTANT_PROVIDERS) {
    const choice = resolveAssistantFunding({
      provider,
      stored: config.fundingPreference.find((item) => item.provider === provider)?.mode ?? null,
      options: config.funding,
      creditsEnabled: config.creditsEnabled,
    });
    const option = config.funding.find(
      (item) => item.provider === provider && item.mode === choice.mode,
    );
    // A reached spending cap does not disconnect an existing funding source.
    const connected =
      choice.mode === "byok"
        ? option?.credential?.status === "active"
        : config.creditsEnabled && (option?.available || option?.reason === "limit_exceeded");
    if (!connected) continue;
    result.push({
      connectionId: `ai:${provider}`,
      providerId: provider,
      label:
        provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Anthropic" : "OpenRouter",
      credentialSource: choice.mode === "credits" ? "hosted" : "own",
      billable: true,
    });
  }
  return result;
}
