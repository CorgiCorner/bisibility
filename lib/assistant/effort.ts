import type { AssistantProvider } from "./wire";

/** Every reasoning effort a supported provider accepts; each model lists the subset it offers. */
export const ASSISTANT_EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const;
export type AssistantEffort = (typeof ASSISTANT_EFFORTS)[number];

/**
 * Efforts each provider adapter can send. Anthropic has no "none" (thinking is lowered through
 * effort) and the OpenRouter reasoning option has no "max".
 */
export const PROVIDER_EFFORTS: Readonly<Record<AssistantProvider, readonly AssistantEffort[]>> = {
  openai: ASSISTANT_EFFORTS,
  anthropic: ["low", "medium", "high", "xhigh", "max"],
  openrouter: ["none", "low", "medium", "high", "xhigh"],
};

type EffortModel = {
  efforts?: readonly AssistantEffort[];
  defaultEffort?: AssistantEffort;
};

/**
 * The effort a turn runs with: the requested one when the model offers it, otherwise the model
 * default. Models without reasoning run with null. Returns undefined for an effort the model does
 * not offer, which the server rejects instead of silently changing the user's choice.
 */
export function resolveAssistantEffort(
  model: EffortModel,
  requested: AssistantEffort | null | undefined,
): AssistantEffort | null | undefined {
  const efforts = model.efforts ?? [];
  if (!efforts.length) return requested ? undefined : null;
  if (!requested) return model.defaultEffort ?? undefined;
  return efforts.includes(requested) ? requested : undefined;
}

/**
 * The effort stored on a run, checked again against the current catalog before every step.
 * A run whose effort the model no longer offers stops as model_unavailable.
 */
export function runAssistantEffort(
  model: EffortModel,
  stored: string | null | undefined,
): AssistantEffort | null {
  const known = ASSISTANT_EFFORTS.find((effort) => effort === stored);
  const effort = stored && !known ? undefined : resolveAssistantEffort(model, known ?? null);
  if (effort === undefined)
    throw Object.assign(new Error("Effort unavailable"), { code: "model_unavailable" as const });
  return effort;
}
