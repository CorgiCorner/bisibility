import { createHash } from "node:crypto";
import { isLegacyPrompt, isLegacyVisibility } from "./legacy";
import { researchPaymentIdentity } from "./research-payment";
import type { AiResearchKind, PromptInput, VisibilityInput } from "./schema";
export function researchCacheIdentity(
  projectId: string,
  connectionId: string,
  kind: AiResearchKind,
  input: PromptInput | VisibilityInput,
) {
  const legacy = "prompt" in input ? isLegacyPrompt(input) : isLegacyVisibility(input);
  const { fresh, max_cost_cents: _cap, ...rawIdentity } = researchPaymentIdentity(input);
  if (legacy && "prompt" in rawIdentity) {
    delete (rawIdentity as Partial<PromptInput>).cost_policy;
    delete (rawIdentity as Partial<PromptInput>).max_output_tokens;
    delete (rawIdentity as Partial<PromptInput>).web_search;
    delete (rawIdentity as Partial<PromptInput>).response_language;
    delete (rawIdentity as Partial<PromptInput>).country_iso_code;
  }
  const identity = Object.fromEntries(
    Object.entries(rawIdentity).filter(([, value]) => value !== undefined),
  );
  const version = legacy ? "v1" : "v2";
  // Retrieval normalization changed; never reuse earlier visibility rows with a different filter.
  const cacheVersion = kind === "ai_visibility" ? `${version}-provider-domain-v1` : version;
  const key = `ai:${cacheVersion}:${projectId}:${connectionId}:${kind}:${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
  return { identity, key, fresh };
}
