import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import {
  isLegacyModel,
  isLegacyPrompt,
  isLegacyVisibility,
  legacyModelAdmissionBound,
} from "@/lib/ai-research/legacy";
import { promptSchema, visibilitySchema } from "@/lib/ai-research/schema";
import type { AiResearchOutcome } from "@/lib/ai-research/service";

export const aiResearchCatalogFixture: AiResearchCatalog = {
  actualCostAvailable: true,
  models: [
    {
      id: "gpt-4.1-mini",
      provider: "chat_gpt",
      label: "GPT-4.1 mini",
      reasoning: false,
      webSearch: true,
      minOutputTokens: 16,
      maxOutputTokens: 4096,
      priceAvailable: true,
      admissionEnabled: true,
      actualCostEnabled: true,
    },
    {
      id: "gpt-4.1-nano",
      provider: "chat_gpt",
      label: "GPT-4.1 nano",
      reasoning: false,
      webSearch: true,
      minOutputTokens: 16,
      maxOutputTokens: 4096,
      priceAvailable: true,
      admissionEnabled: true,
      actualCostEnabled: true,
    },
    {
      id: "reasoning-example",
      provider: "chat_gpt",
      label: "Reasoning example",
      reasoning: true,
      webSearch: false,
      minOutputTokens: 1024,
      maxOutputTokens: 4096,
      priceAvailable: false,
      admissionEnabled: false,
      actualCostEnabled: true,
    },
  ],
  visibilityMarkets: [
    {
      platform: "chat_gpt",
      locationCode: 2840,
      countryName: "United States",
      languages: [{ code: "en", name: "English" }],
    },
    {
      platform: "google",
      locationCode: 2840,
      countryName: "United States",
      languages: [{ code: "en", name: "English" }],
    },
    {
      platform: "google",
      locationCode: 2616,
      countryName: "Poland",
      languages: [
        { code: "pl", name: "Polish" },
        { code: "en", name: "English" },
      ],
    },
  ],
  responseCountries: [
    { code: "US", name: "United States" },
    { code: "PL", name: "Poland" },
  ],
  responseLanguages: [
    { code: "en", name: "English" },
    { code: "pl", name: "Polish" },
  ],
  limits: { maxModels: 2, maxOutputTokens: 4096 },
  fetchedAt: new Date().toISOString(),
};

export async function fixtureResearchAction(
  _projectId: string,
  mode: "prompt" | "visibility",
  input: unknown,
): Promise<AiResearchOutcome> {
  const parsed = (mode === "prompt" ? promptSchema : visibilitySchema).safeParse(input);
  if (parsed.success && !parsed.data.estimate_only)
    return {
      ok: false,
      reason: "fixture_stop",
      message: "This fixture does not execute provider runs.",
    };
  if (!parsed.success)
    return { ok: false, reason: "fixture_invalid", message: "Invalid fixture input." };
  if ("cost_policy" in parsed.data && parsed.data.cost_policy === "provider_actual_cost")
    return {
      ok: true,
      estimate: true,
      evidence: "synthetic_prompt_test",
      estimatedCostCents: 12,
      estimateKind: "forecast",
      forecastScope: "tokens_and_base_only",
      isPartialEstimate: true,
      isGuaranteedMaximum: false,
      credentialSource: "own",
      estimateCredentialsRef: "a".repeat(64),
      forecastAssumptions: [
        "Fictional UI fixture, not a live provider quote. Covers tokens and base fees only; excludes search, fetched content, loop input and role serialization overhead.",
      ],
    };
  if ("models" in parsed.data && isLegacyPrompt(parsed.data))
    return {
      ok: true,
      estimate: true,
      evidence: "synthetic_prompt_test",
      estimateKind: "admission_bound",
      isGuaranteedMaximum: false,
      estimatedCostCents: parsed.data.models.reduce(
        (sum, model) => sum + (isLegacyModel(model) ? legacyModelAdmissionBound(model) : 0),
        0,
      ),
    };
  if ("platform" in parsed.data && isLegacyVisibility(parsed.data))
    return {
      ok: true,
      estimate: true,
      evidence: "observed_dataset",
      estimatedCostCents: 10 + parsed.data.limit * 0.1,
    };
  return {
    ok: false,
    reason: "pricing_unavailable",
    message: "No fresh provider quote is simulated by this fixture.",
  };
}

export async function fixtureUnknownCostAction(
  projectId: string,
  mode: "prompt" | "visibility",
  input: unknown,
): Promise<AiResearchOutcome> {
  const parsed = promptSchema.safeParse(input);
  if (
    mode === "prompt" &&
    parsed.success &&
    !parsed.data.estimate_only &&
    parsed.data.cost_policy === "provider_actual_cost"
  )
    return {
      ok: true,
      estimate: false,
      cached: false,
      reportId: "agr_fictional_unknown_receipt",
      costCents: 0,
      retryBlocked: true,
      result: {
        evidence: "synthetic_prompt_test",
        rows: [],
        totalAvailable: null,
        truncated: true,
        fetchedAt: "2026-10-06T12:00:00Z",
        costCents: 0,
        costStatus: "unknown",
        failure: "Fictional unknown receipt. No provider was called.",
      },
    };
  return fixtureResearchAction(projectId, mode, input);
}

export async function fixtureCredentialRotationAction(
  projectId: string,
  mode: "prompt" | "visibility",
  input: unknown,
): Promise<AiResearchOutcome> {
  const parsed = promptSchema.safeParse(input);
  if (
    mode === "prompt" &&
    parsed.success &&
    !parsed.data.estimate_only &&
    parsed.data.cost_policy === "provider_actual_cost"
  )
    return {
      ok: false,
      reason: "credentials_changed",
      message: "Fictional credential rotation before dispatch; no provider called.",
      safeToStartNewRequest: true,
      retryBlocked: false,
    };
  return fixtureResearchAction(projectId, mode, input);
}

export const fixtureChargedFailure: AiResearchOutcome = {
  ok: true,
  estimate: false,
  cached: true,
  reportId: "agr_fictional_charged_failure",
  costCents: 0,
  result: {
    evidence: "synthetic_prompt_test",
    rows: [],
    totalAvailable: null,
    truncated: true,
    fetchedAt: "2026-10-06T12:00:00Z",
    costCents: 7.32,
    costStatus: "confirmed",
    failure: "Fictional charged failure without answers; no provider called.",
  },
};
