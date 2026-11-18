/** Model steps allowed in one assistant turn. */
export const ASSISTANT_MAX_STEPS = 6;

export function assistantMaxSteps() {
  return ASSISTANT_MAX_STEPS;
}

/**
 * A stopped or cut-off answer has no provider receipt: it is charged at once for an estimate of
 * its output. For an OpenRouter Credits answer the provider-reported cost may replace that
 * estimate, in either direction, for this many minutes after the stop; after that the estimate
 * stands. Code, interface copy and tests share this one value.
 */
export const ASSISTANT_STOP_CORRECTION_MINUTES = 10;

/**
 * A dispatched attempt still open this long after dispatch outlived every step deadline and its
 * step lease, so the process that sent it is gone (a crash or a deploy): it is charged as a stop.
 */
export const ASSISTANT_ABANDONED_ATTEMPT_MS = 10 * 60000;

/**
 * Hidden reasoning a stopped answer is charged for is bounded by time: the seconds between the
 * provider's response and the first visible output (or the stop), times this ceiling on a
 * provider's output speed. Anthropic sends no thinking configuration, so it reasons visibly or
 * not at all. Owner-tunable assumptions, set well above the published speed of each provider's
 * reasoning models; an OpenRouter Credits stop is measured by its generation lookup instead.
 */
export const ASSISTANT_HIDDEN_REASONING_TOKENS_PER_SECOND = {
  openai: 500,
  anthropic: 0,
  openrouter: 3000,
} as const;

/** Per-turn output caps the composer offers below the model's own catalog maximum. */
export const ASSISTANT_OUTPUT_LIMITS = [1024, 4096, 16384] as const;

/**
 * The output cap a turn runs with: the requested one when it is a positive integer no higher than
 * the model's catalog maximum, the catalog maximum when none was requested, and undefined for a
 * request above the maximum, which the server rejects instead of silently lowering it.
 */
export function resolveAssistantOutputLimit(
  model: { maxOutputTokens: number },
  requested: number | null | undefined,
): number | undefined {
  if (requested === null || requested === undefined) return model.maxOutputTokens;
  if (!Number.isSafeInteger(requested) || requested < 1) return undefined;
  return requested <= model.maxOutputTokens ? requested : undefined;
}

/** The cap stored on a run, never above the current catalog maximum for any later step. */
export function runAssistantOutputLimit(
  model: { maxOutputTokens: number },
  stored: number | null | undefined,
): number {
  return stored && stored > 0 ? Math.min(stored, model.maxOutputTokens) : model.maxOutputTokens;
}

/**
 * Output tokens a turn may still spend: its cap minus the output already settled on the run, so
 * the cap bounds the whole turn (up to the step limit of model calls), not each call. Zero ends
 * the turn with limit_exceeded.
 */
export function remainingAssistantOutput(limit: number, used: number | null | undefined): number {
  return Math.max(0, limit - Math.max(0, used ?? 0));
}

/** Composer choices for a model: the fixed caps below its maximum, then the maximum itself. */
export function assistantOutputLimitChoices(modelMax: number): number[] {
  return [...ASSISTANT_OUTPUT_LIMITS.filter((limit) => limit < modelMax), modelMax];
}
