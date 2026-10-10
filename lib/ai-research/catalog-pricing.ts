import { z } from "zod";

export type AiModelRate = {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  contextTokens: number;
  // The model's hard ceiling, not the requested response limit.
  maxOutputTokens: number;
  // A verified total fee ceiling for one response, not a per-search rate.
  webSearchMaxCostCents?: number;
  checkedAt: string;
  sourceUrl: string;
  limitsSourceUrl?: string;
  currencySourceUrl?: string;
  cachedInputUsdPerMillion?: number;
  reasoning?: boolean;
  pricingNotes?: string[];
  forecastAssumptions?: string[];
};

type ModelCapability = {
  reasoning: boolean;
  web_search_supported: boolean;
};
type InputOptions = { max_output_tokens: number; web_search: boolean };

const requestPrice = z.strictObject({
  cost_type: z.literal("per_request"),
  cost: z.number().finite().positive(),
});
const accountPricing = z.object({
  status_code: z.literal(20000),
  cost: z.literal(0),
  tasks_error: z.literal(0),
  tasks: z
    .array(
      z.object({
        status_code: z.literal(20000),
        cost: z.literal(0),
        result: z.array(z.object({ price: z.record(z.string(), z.unknown()) })).length(1),
      }),
    )
    .length(1),
});

function property(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

function accountPriceRows(payload: unknown, path: string[]): unknown {
  const account = accountPricing.safeParse(payload);
  if (!account.success) return undefined;
  return path.reduce<unknown>(
    (value, key) => property(value, key),
    account.data.tasks[0].result[0].price,
  );
}

// Authenticated free user_data evidence confirms this shared Responses base-price path.
// It does not supply complete model token or paid search bounds.
export function parseResponsesBasePrice(payload: unknown): number | null {
  const value = accountPriceRows(payload, [
    "ai_optimization",
    "llm_responses",
    "live",
    "priority_normal",
  ]);
  const parsed = z.array(requestPrice).length(1).safeParse(value);
  if (!parsed.success) return null;
  const costCents = parsed.data[0].cost * 100;
  return Number.isFinite(costCents) ? costCents : null;
}

export type AiVisibilityPrice = { requestCostCents: number; rowCostCents: number };

export function parseVisibilityPrice(payload: unknown): AiVisibilityPrice | null {
  const value = accountPriceRows(payload, [
    "ai_optimization",
    "llm_mentions",
    "search_mentions",
    "live",
    "priority_normal",
  ]);
  const parsed = z
    .array(
      z.strictObject({
        cost_type: z.enum(["per_request", "per_result"]),
        cost: z.number().finite().positive(),
      }),
    )
    .length(2)
    .safeParse(value);
  if (!parsed.success) return null;
  const requests = parsed.data.filter((row) => row.cost_type === "per_request");
  const results = parsed.data.filter((row) => row.cost_type === "per_result");
  if (requests.length !== 1 || results.length !== 1) return null;
  const requestCostCents = requests[0].cost * 100;
  const rowCostCents = results[0].cost * 100;
  if (!Number.isFinite(requestCostCents) || !Number.isFinite(rowCostCents)) return null;
  return { requestCostCents, rowCostCents };
}

const modelRate = z.strictObject({
  cachedInputUsdPerMillion: z.number().finite().nonnegative().optional(),
  reasoning: z.boolean().optional(),
  pricingNotes: z.array(z.string().max(1000)).max(30).optional(),
  forecastAssumptions: z.array(z.string().max(1000)).max(30).optional(),
  inputUsdPerMillion: z.number().finite().positive(),
  outputUsdPerMillion: z.number().finite().positive(),
  contextTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxOutputTokens: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  webSearchMaxCostCents: z.number().finite().positive().optional(),
  checkedAt: z.iso.datetime(),
  sourceUrl: z.url().refine((value) => value.startsWith("https://")),
  limitsSourceUrl: z
    .url()
    .refine((value) => value.startsWith("https://"))
    .optional(),
  currencySourceUrl: z
    .url()
    .refine((value) => value.startsWith("https://"))
    .optional(),
});

export function catalogAdmissionBound(
  capability: ModelCapability,
  input: InputOptions,
  basePriceCents: number | null,
  rate: AiModelRate | null,
): number | null {
  const parsed = modelRate.safeParse(rate);
  if (
    !parsed.success ||
    !Number.isFinite(basePriceCents) ||
    !basePriceCents ||
    basePriceCents < 0
  ) {
    return null;
  }
  if (
    !Number.isInteger(input.max_output_tokens) ||
    input.max_output_tokens < (capability.reasoning ? 1024 : 16) ||
    input.max_output_tokens > 4096 ||
    input.max_output_tokens > parsed.data.maxOutputTokens
  ) {
    return null;
  }
  if (
    input.web_search &&
    (!capability.web_search_supported || !parsed.data.webSearchMaxCostCents)
  ) {
    return null;
  }
  const outputTokens =
    capability.reasoning || input.web_search
      ? parsed.data.maxOutputTokens
      : input.max_output_tokens;
  const costCents =
    basePriceCents +
    (parsed.data.contextTokens * parsed.data.inputUsdPerMillion +
      outputTokens * parsed.data.outputUsdPerMillion) /
      10_000 +
    (input.web_search ? (parsed.data.webSearchMaxCostCents ?? 0) : 0);
  if (
    !Number.isFinite(costCents) ||
    costCents <= 0 ||
    costCents > Number.MAX_SAFE_INTEGER / 10_000
  ) {
    return null;
  }
  return Math.ceil(costCents * 10_000) / 10_000;
}
