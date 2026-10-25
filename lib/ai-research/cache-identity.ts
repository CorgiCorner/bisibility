import { createHash } from "node:crypto";
import { engineCalibrationIdentity } from "./engine-bounds";
import { isLegacyPrompt, isLegacyVisibility } from "./legacy";
import { researchMatchType } from "./prompt-research-schema";
import { researchPaymentIdentity } from "./research-payment";
import type { AiResearchKind, PromptInput, ResearchInput } from "./schema";
export function researchCacheIdentity(
  projectId: string,
  connectionId: string,
  kind: AiResearchKind,
  input: ResearchInput,
  accountId?: string,
  fundingIdentity?: string,
  reuseTtlSeconds?: number,
) {
  if ("keyword" in input) {
    if (!accountId || !fundingIdentity)
      throw new Error("Research cache requires an account and funding identity.");
    if (!Number.isInteger(reuseTtlSeconds) || (reuseTtlSeconds ?? 0) <= 0)
      throw new Error("Research cache requires a validated reuse policy.");
    const identity = {
      keyword: input.keyword,
      platform: input.platform,
      location_code: input.location_code,
      language_code: input.language_code,
      match_type: researchMatchType(input.keyword),
      limit: input.limit,
    };
    const hash = createHash("sha256")
      .update(JSON.stringify([accountId, fundingIdentity, reuseTtlSeconds, identity]))
      .digest("hex");
    return { identity, key: `ai:prompt-research-v2:${hash}`, fresh: input.fresh };
  }
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
  const engines = "prompt" in input ? input.engines : undefined;
  const version = legacy ? "v1" : engines?.length ? "v3-engines" : "v2";
  // Retrieval normalization changed; never reuse earlier visibility rows with a different filter.
  const cacheVersion = kind === "ai_visibility" ? `${version}-provider-domain-v1` : version;
  // A recalibrated flagship or bound must never serve an answer from the previous model.
  const hashed = engines?.length
    ? { identity, calibration: engineCalibrationIdentity(engines) }
    : identity;
  const key = `ai:${cacheVersion}:${projectId}:${connectionId}:${kind}:${createHash("sha256").update(JSON.stringify(hashed)).digest("hex")}`;
  return { identity, key, fresh };
}
